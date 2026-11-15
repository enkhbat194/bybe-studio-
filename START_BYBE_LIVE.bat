@echo off
setlocal
cd /d "%~dp0"
title BYBE Studio - LIVE (automatic Git updates)
echo.
echo BYBE LIVE - one-click local development. Requires Git, Node 22, FFmpeg.
echo Automatically fast-forwards ONLY feature/typography-ocr-workstation.
echo Your uncommitted code changes are NEVER overwritten.
echo Close this window to stop the local workstation.
echo.
where git >nul 2>nul
if errorlevel 1 (echo Git not found in PATH.& pause & exit /b 1)
where node >nul 2>nul
if errorlevel 1 (echo Node.js not found in PATH.& pause & exit /b 1)
where npm >nul 2>nul
if errorlevel 1 (echo npm not found in PATH.& pause & exit /b 1)
if not exist "node_modules\tsx" (
 echo First run - installing dependencies...
 call npm install --no-audit --no-fund
 if errorlevel 1 (echo npm install failed.& pause & exit /b 1)
)
if not defined BYBE_ASR_DEVICE set "BYBE_ASR_DEVICE=cpu"
echo.
echo Starting BYBE server first. GitHub sync will NOT delay startup.
echo Open http://localhost:3000 only after the "listening" message appears.
echo If error appears, this window stays open so it can be read.
echo.
node scripts\dev_live.mjs
echo.
echo BYBE Studio LIVE has stopped. Read any errors above.
pause
