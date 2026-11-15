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
py -3.11 -c "from faster_whisper import WhisperModel; print('faster-whisper Python import: OK')"
if errorlevel 1 (
 echo faster-whisper still does not import. Check the Python install above.
 pause
 exit /b 1
)
echo.
echo Whisper library imports correctly. Restart BYBE Studio.
echo BYBE now uses CPU by default; this avoids missing cublas64_12.dll.
echo First transcription may download the free 'small' speech model.
echo CPU ASR can be slower than CUDA. Set BYBE_ASR_DEVICE=cuda ONLY after installing CUDA 12 + cuDNN.

pause
