"""End-to-end worker device initialization without downloading a model.

Simulates the WhisperModel API so we catch accidentally commented Python assignments,
while independently verifying real faster-whisper installation on the user's Windows PC.
"""
import os
import sys
import tempfile
import types
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.local_asr_worker import transcribe

created=[]
class FakeWhisperModel:
    def __init__(self, model_name, device, compute_type, cpu_threads=0, num_workers=1):
        assert cpu_threads==4 and num_workers==1
        created.append((model_name, device, compute_type))
    def transcribe(self, wav, **kwargs):
        # Called once per VAD-separated utterance, NOT once per 5-minute file.
        assert kwargs["language"] is None
        assert kwargs["vad_filter"] is False
        idx = len(transcribed)
        transcribed.append(kwargs)
        lang = "cs" if idx % 2 == 0 else "en"
        word = "dnes" if lang == "cs" else "today"
        segment = types.SimpleNamespace(start=0.1,end=0.75,text=word,
         words=[types.SimpleNamespace(start=0.1,end=0.75,word=word)])
        return iter([segment]), types.SimpleNamespace(language=lang,language_probability=.91)

mock_module=types.ModuleType("faster_whisper")
mock_module.WhisperModel=FakeWhisperModel
sys.modules["faster_whisper"]=mock_module
audio_module=types.ModuleType("faster_whisper.audio")
audio_module.decode_audio=lambda wav,sampling_rate=16000: [0.0]*80000
sys.modules["faster_whisper.audio"]=audio_module
vad_module=types.ModuleType("faster_whisper.vad")
vad_module.VadOptions=lambda **kwargs: kwargs
vad_module.get_speech_timestamps=lambda samples,options,sampling_rate=16000: [
 {"start":8000,"end":24000},{"start":40000,"end":56000}]
sys.modules["faster_whisper.vad"]=vad_module
transcribed=[]
with tempfile.TemporaryDirectory(prefix="bybe-device-smoke-") as root:
    media=Path(root)/"source.mkv"
    media.write_bytes(b"dummy")
    for setting in ("cpu","auto","bogus"):
        created.clear()
        transcribed.clear()
        with patch.dict(os.environ,{"BYBE_ASR_DEVICE":setting}):
            with patch("scripts.local_asr_worker.subprocess.run") as fake_ff:
                result=transcribe({"id":"cpu-smoke","source":str(media),"start":0,"end":1}, {})
        assert result["ok"] is True, result
        assert result["device"]=="cpu", result
        assert created[0][1]=="cpu", created
        assert created[0][2]=="int8", created
        assert fake_ff.called, "expected FFmpeg conversion"
        assert len(transcribed)==2, "language detection must be per VAD utterance"
        assert result["languageScope"]=="utterance"
        assert result["asrPass"]=="VAD_UTTERANCE"
        assert [x["language"] for x in result["segments"]]==["cs","en"]
        assert [round(x["start"],2) for x in result["segments"]]==[.6,2.6]
        assert all(x["reviewReasons"]==[] for x in result["segments"])
print("PASS CPU worker initializes and separately detects Czech/English per VAD utterance")
