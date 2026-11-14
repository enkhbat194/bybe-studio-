#!/usr/bin/env python3
"""BYBE local Czech/English ASR worker. JSON Lines over stdio; no paid cloud API.

Install (optional): py -3.11 -m pip install faster-whisper
GPU CUDA libraries must be compatible with ctranslate2; CPU fallback is explicit in output.
English/Czech switching inside a part requires manual QA: language is PART-LEVEL only.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

# Windows often defaults to cp1252 even though Node sends JSON Lines in UTF-8.
# A single Mongolian error message previously crashed the entire worker.
for stream in (sys.stdin, sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=True) + "\n")
    sys.stdout.flush()


def transcribe(command: dict, model_cache: dict) -> dict:
    job_id = str(command.get("id", ""))
    source = Path(str(command.get("source", "")))
    start = float(command.get("start", -1))
    end = float(command.get("end", -1))
    if not source.is_file() or start < 0 or end <= start or end - start > 600:
        raise ValueError("Буруу эх файл эсвэл хугацаа.")
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise RuntimeError("faster-whisper суулгаагүй: py -3.11 -m pip install faster-whisper") from exc

    model_name = os.getenv("BYBE_ASR_MODEL", "small")
    # CPU is the reliable out-of-box mode on Windows; a CUDA-capable GPU alone does\n    # not provide the required cublas64_12.dll / cuDNN runtime. Opt into cuda explicitly.\n    selected = os.getenv("BYBE_ASR_DEVICE", "cpu")
    if selected not in {"auto", "cpu", "cuda"}:
        selected = "auto"
    if model_cache.get("model") is None:
        device = "cuda" if selected == "cuda" else "cpu"
        try:
            model_cache["model"] = WhisperModel(model_name, device=device,
                                               compute_type="int8_float16" if device == "cuda" else "int8")
            model_cache["device"] = device
        except Exception as error:
            if selected == "cuda":
                raise RuntimeError("CUDA загвар эхлүүлэх боломжгүй: " + str(error)) from error
            print("CUDA unavailable; falling back to CPU: " + str(error), file=sys.stderr, flush=True)
            model_cache["model"] = WhisperModel(model_name, device="cpu", compute_type="int8")
            model_cache["device"] = "cpu"

    # Never overwrite the user's original media; only a temporary PCM workfile.
    with tempfile.TemporaryDirectory(prefix="bybe-asr-") as temp:
        wav = str(Path(temp) / "part.wav")
        args = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                "-ss", str(start), "-i", str(source), "-t", str(end - start),
                "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav]
        subprocess.run(args, check=True, capture_output=True, timeout=150)
        segments, info = model_cache["model"].transcribe(
            wav, beam_size=4, vad_filter=True, word_timestamps=True,
            condition_on_previous_text=False, language=None)
        detected = info.language or "unknown"
        output = []
        for segment in segments:
            text = segment.text.strip()
            if not text:
                continue
            words = []
            for word in (segment.words or []):
                if word.start is None or word.end is None:
                    continue
                words.append({"start": round(start + word.start, 3),
                              "end": round(start + word.end, 3),
                              "text": word.word})
            output.append({"start": round(start + segment.start, 3),
                           "end": round(start + segment.end, 3),
                           "text": text, "words": words,
                           "language": detected, "languageScope": "part"})
    return {"id": job_id, "ok": True, "segments": output, "language": detected,
            "languageScope": "part", "device": model_cache["device"],
            "status": "ASR_PROPOSAL_REVIEW_REQUIRED"}


def main() -> None:
    cache: dict = {}
    for line in sys.stdin:
        try:
            command = json.loads(line)
            if not isinstance(command, dict):
                raise ValueError("JSON request буруу байна.")
            result = transcribe(command, cache)
            emit(result)
        except Exception as error:
            emit({"id": str(command.get("id", "")) if isinstance(locals().get("command"), dict) else "",
                  "ok": False, "error": str(error)[:800]})


if __name__ == "__main__":
    main()
