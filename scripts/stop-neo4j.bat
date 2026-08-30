@ECHO OFF
SETLOCAL

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-neo4j.ps1"
EXIT /B %ERRORLEVEL%
