@echo off
setlocal
cd /d "%~dp0"
title BYBE Studio - Local Workstation

where node >nul 2>nul
if errorlevel 1 (
 echo.
 echo Node.js is not installed. Install Node.js 22 LTS from https://nodejs.org/
 echo Then run this BAT file again.
 pause
 exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
 echo npm was not found. Reinstall Node.js with npm enabled.
 pause
 exit /b 1
)
if not exist "node_modules\tsx" (
 echo Installing BYBE Studio dependencies - first run only...
 call npm install --no-audit --no-fund
 if errorlevel 1 (
  echo Installation failed. Check internet access or npm errors.
  pause
  exit /b 1
 )
)
echo.
echo Starting local BYBE Studio...
echo When ready open http://localhost:3000
echo Close this window to stop the local server.
echo.
start "" "http://localhost:3000"
call npm run dev
if errorlevel 1 (
 echo BYBE Studio stopped with an error.
 pause
)
