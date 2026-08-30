# Anantham V2 End-of-Task Multi-Engine Synchronization Pipeline
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '   ANANTHAM V2 — END-OF-TASK MULTI-ENGINE SYNCHRONIZATION PIPELINE' -ForegroundColor Cyan
Write-Host '=================================================================' -ForegroundColor Cyan

# 1. Verification Gate
Write-Host "`n[STEP 1/7] Running Quality and Durability Verification Gate..." -ForegroundColor Yellow
powershell -ExecutionPolicy Bypass -File scripts/verify-all.ps1
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[ERROR] Verification pipeline failed! Aborting synchronization." -ForegroundColor Red
    exit 1
}

# 2. CodeGraph Synchronization
Write-Host "`n[STEP 2/7] Synchronizing CodeGraph AST and Call Paths..." -ForegroundColor Yellow
powershell -ExecutionPolicy Bypass -File scripts/sync-codegraph.ps1

# 3. Graphify Knowledge Graph
Write-Host "`n[STEP 3/7] Synchronizing Graphify Knowledge Graph..." -ForegroundColor Yellow
powershell -ExecutionPolicy Bypass -File scripts/sync-graphify.ps1

# 4. Neo4j Cypher Synchronization
Write-Host "`n[STEP 4/7] Synchronizing Neo4j Graph Database..." -ForegroundColor Yellow
powershell -ExecutionPolicy Bypass -File scripts/sync-neo4j.ps1

# 5. Graphiti Episodic Memory Update
Write-Host "`n[STEP 5/7] Synchronizing Graphiti Episodic Memory..." -ForegroundColor Yellow
node scripts/sync-graphiti.mjs

# 6. State Registers and Scorecard Sync
Write-Host "`n[STEP 6/7] Updating Authoritative State Registers and Scorecard..." -ForegroundColor Yellow
powershell -ExecutionPolicy Bypass -File scripts/sync-state.ps1

# 7. Git Commit and Push for Stateless Recovery
Write-Host "`n[STEP 7/7] Committing and Pushing to GitHub for Stateless Recovery..." -ForegroundColor Yellow
powershell -ExecutionPolicy Bypass -File scripts/sync-git.ps1

Write-Host "`n=================================================================" -ForegroundColor Green
Write-Host '   END-OF-TASK SYNCHRONIZATION COMPLETED SUCCESSFULLY (100%)    ' -ForegroundColor Green
Write-Host '=================================================================' -ForegroundColor Green

# 8. Standard Engineering Verdict
node scripts/generate-verdict.mjs
