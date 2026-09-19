@echo off
setlocal
cd /d "%~dp0"
if not exist .env (
  echo Missing .env file. Run install-windows.ps1 first.
  pause
  exit /b 1
)
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:3000'"
node dist\server.js
if errorlevel 1 echo Dashboard stopped with an error. Check the message above.
pause
