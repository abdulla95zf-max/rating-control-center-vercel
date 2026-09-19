@echo off
setlocal
cd /d "%~dp0"
node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(console.log).catch(()=>{console.error('Dashboard is not running');process.exit(1)})"
pause
