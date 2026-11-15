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
from scripts.local_asr_worker import transcribe

created=[]
class FakeWhisperModel:
    def __init__(self, model_name, device, compute_type):
        created.append((model_name, device, compute_type))
    def transcribe(self, wav, **kwargs):
        return iter(()), types.SimpleNamespace(language="cs")

mock_module=types.ModuleType("faster_whisper")
mock_module.WhisperModel=FakeWhisperModel
sys.modules["faster_whisper"]=mock_module
with tempfile.TemporaryDirectory(prefix="bybe-device-smoke-") as root:
    media=Path(root)/"source.mkv"
    media.write_bytes(b"dummy")
    for setting in ("cpu","auto","bogus"):
        created.clear()
        with patch.dict(os.environ,{"BYBE_ASR_DEVICE":setting}):
            with patch("scripts.local_asr_worker.subprocess.run") as fake_ff:
                result=transcribe({"id":"cpu-smoke","source":str(media),"start":0,"end":1}, {})
        assert result["ok"] is True, result
        assert result["device"]=="cpu", result
        assert created[0][1]=="cpu", created
        assert created[0][2]=="int8", created
        assert fake_ff.called, "expected FFmpeg conversion"
print("PASS Python Whisper worker device variable initialized in CPU/auto/invalid modes")
