@echo off
cd /d "%~dp0"
echo Starting Plant Problem Logger...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -OpenBrowser
pause
