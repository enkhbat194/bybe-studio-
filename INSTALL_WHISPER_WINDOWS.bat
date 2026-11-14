@echo off
setlocal
cd /d "%~dp0"
title BYBE Studio - optional local Whisper ASR
echo.
echo Optional FREE local faster-whisper setup (no API key).
echo Needs Python 3.11 and internet for first installation/model download.
echo.
where py >nul 2>nul
if errorlevel 1 (
 echo Python Launcher is missing. Install Python 3.11 from python.org.
 pause
 exit /b 1
)
py -3.11 --version
if errorlevel 1 (
 echo Python 3.11 not found.
 pause
 exit /b 1
)
py -3.11 -m pip install --upgrade faster-whisper
if errorlevel 1 (
 echo Installation failed. See the error above.
 pause
 exit /b 1
)
echo.
echo faster-whisper installed. Restart START_BYBE.bat.
echo ASR model 'small' is downloaded on first transcription.
echo RTX GPU uses CUDA only if your CUDA/cuDNN runtime is compatible.
echo Otherwise BYBE falls back to CPU, which is slower.
pause
