@echo off
setlocal
cd /d "%~dp0"
title BYBE Studio - More Accurate Whisper (CPU)
rem Opt-in. Medium model may improve Czech/English recognition but will be MUCH slower.
rem Will not change already stored ASR jobs until explicit "Reprocess VAD" action.
set "BYBE_ASR_DEVICE=cpu"
set "BYBE_ASR_MODEL=medium"
set "BYBE_ASR_CPU_THREADS=4"
echo.
echo BYBE QUALITY MODE
echo Whisper model: medium (CPU int8; slower than small)
echo Silero VAD: per utterance, per-utterance language detection
echo Existing files and manual QA will NOT be deleted.
echo Initial run downloads the medium model; internet access required.
echo Close other BYBE servers on port 3000 before continuing.
echo.
call "%~dp0START_BYBE.bat"
