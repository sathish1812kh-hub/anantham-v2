@ECHO OFF
SETLOCAL

SET NEO4J_HOME=C:\Users\Sathish\.Neo4jDesktop2\Data\dbmss\dbms-478d0a0c-9ea8-43e0-9012-fc3c2983ccf4
SET NEO4J_BIN=%NEO4J_HOME%\bin\neo4j.bat

powershell -NoProfile -ExecutionPolicy Bypass -Command "$tcp = New-Object System.Net.Sockets.TcpClient; try { $tcp.Connect('127.0.0.1', 7687); Write-Host 'Neo4j is already running on port 7687.'; $tcp.Close(); exit 0 } catch { exit 1 }"
IF %ERRORLEVEL% EQU 0 (
    EXIT /B 0
)

echo Starting Neo4j local DBMS in the background...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c \"\"%NEO4J_BIN%\" console\"' -WindowStyle Hidden"

echo Waiting for Neo4j to listen on port 7687...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$maxRetries = 30; for ($i = 0; $i -lt $maxRetries; $i++) { try { $tcp = New-Object System.Net.Sockets.TcpClient; $tcp.Connect('127.0.0.1', 7687); $tcp.Close(); Write-Host 'Neo4j is online!'; exit 0 } catch { Start-Sleep -Seconds 1 } }; Write-Host 'Timeout waiting for Neo4j startup.'; exit 1"

EXIT /B %ERRORLEVEL%
