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
where ffmpeg >nul 2>nul
if errorlevel 1 (
 echo WARNING: FFmpeg not found. WAV export, waveform, video preview and automatic scan will not work.
 echo Add ffmpeg.exe and ffprobe.exe to your Windows PATH and restart this window.
)
where ffprobe >nul 2>nul
if errorlevel 1 (
 echo WARNING: FFprobe not found. Local video import cannot finish.
)
if not defined BYBE_ASR_DEVICE set "BYBE_ASR_DEVICE=cpu"
echo Whisper device: %BYBE_ASR_DEVICE% (CPU mode requires no CUDA DLL)
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
