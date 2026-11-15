#!/usr/bin/env python3
"""BYBE local Czech/English ASR worker. JSON Lines over stdio; no paid cloud API.

Install (optional): py -3.11 -m pip install faster-whisper
GPU CUDA libraries must be compatible with ctranslate2; CPU fallback is explicit in output.
VAD separates utterances before per-utterance language detection. Mixed-speech still needs QA.
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
    # Restrict CPU inference so OCR, FFmpeg and the browser remain responsive on
    # 6-core/16GB Windows laptops. This is a throughput choice, not accuracy gain.
    try:
        cpu_threads = min(6, max(2, int(os.getenv("BYBE_ASR_CPU_THREADS", "4"))))
    except ValueError:
        cpu_threads = 4
    # CPU is the reliable out-of-box mode on Windows; a CUDA-capable GPU alone
    # does not provide CUDA 12 / cuDNN runtime. Explicitly opt into CUDA.
    selected = os.getenv("BYBE_ASR_DEVICE", "cpu")
    if selected not in {"auto", "cpu", "cuda"}:
        selected = "cpu"
    if model_cache.get("model") is None:
        device = "cuda" if selected == "cuda" else "cpu"
        try:
            model_cache["model"] = WhisperModel(model_name, device=device,
                                               compute_type="int8_float16" if device == "cuda" else "int8",
                                               cpu_threads=cpu_threads, num_workers=1)
            model_cache["device"] = device
        except Exception as error:
            if selected == "cuda":
                raise RuntimeError("CUDA загвар эхлүүлэх боломжгүй: " + str(error)) from error
            print("CUDA unavailable; falling back to CPU: " + str(error), file=sys.stderr, flush=True)
            model_cache["model"] = WhisperModel(model_name, device="cpu", compute_type="int8",cpu_threads=cpu_threads,num_workers=1)
            model_cache["device"] = "cpu"

    # Never overwrite the user's original media; only a temporary PCM workfile.
    with tempfile.TemporaryDirectory(prefix="bybe-asr-") as temp:
        wav = str(Path(temp) / "part.wav")
        args = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                "-ss", str(start), "-i", str(source), "-t", str(end - start),
                "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav]
        subprocess.run(args, check=True, capture_output=True, timeout=150)
        # IMPORTANT: this lesson alternates Czech words, English glosses and repeated
        # examples. Whole-part language=None detects ONE language for 300 seconds and
        # forces it on everything. First separate utterances with Silero VAD; then
        # detect language PER utterance. Faster on CPU is NOT evidence of quality.
        from faster_whisper.audio import decode_audio
        from faster_whisper.vad import VadOptions, get_speech_timestamps

        samples = decode_audio(wav, sampling_rate=16000)
        speech = get_speech_timestamps(
            samples, VadOptions(threshold=0.5, min_speech_duration_ms=180,
                                min_silence_duration_ms=350, speech_pad_ms=110,
                                max_speech_duration_s=15), sampling_rate=16000)
        output = []
        counts = {}
        for utterance in speech:
            i = max(0, int(utterance["start"]))
            j = min(len(samples), int(utterance["end"]))
            if j - i < 16000 * 0.16:
                continue
            # Do not pad both chunks together or two different languages can mix.
            chunk, info = model_cache["model"].transcribe(
                samples[i:j], beam_size=5, vad_filter=False, word_timestamps=True,
                condition_on_previous_text=False, language=None, temperature=0)
            language = getattr(info, "language", None) or "unknown"
            probability = getattr(info, "language_probability", None)
            probability = float(probability) if isinstance(probability, (int, float)) else None
            counts[language] = counts.get(language, 0) + 1
            local_offset = start + i / 16000.0
            local_end = start + j / 16000.0
            for segment in chunk:
                txt = str(getattr(segment, "text", "")).strip()
                if not txt:
                    continue
                # Keep original VAD + Whisper evidence, but NEVER infer a verified
                # Czech/English label from a five-minute context.
                a = max(local_offset, local_offset + float(segment.start))
                b = min(local_end, local_offset + float(segment.end))
                if b - a < 0.08:
                    continue
                words = []
                for word in (getattr(segment, "words", None) or []):
                    if word.start is None or word.end is None:
                        continue
                    wa = max(local_offset, local_offset + float(word.start))
                    wb = min(local_end, local_offset + float(word.end))
                    if wb > wa:
                        words.append({"start": round(wa, 3), "end": round(wb, 3),
                                      "text": word.word})
                reasons = []
                if b-a > 9:
                    reasons.append("LONG_UTTERANCE")
                if language not in ("cs", "en"):
                    reasons.append("UNEXPECTED_LANGUAGE")
                if probability is not None and probability < 0.65:
                    reasons.append("UNCERTAIN_LANGUAGE")
                if len(txt) > 220:
                    reasons.append("LONG_TRANSCRIPT")
                output.append({"start": round(a, 3), "end": round(b, 3),
                               "text": txt, "words": words, "language": language,
                               "languageProbability": probability,
                               "languageScope": "utterance",
                               "asrPass": "VAD_UTTERANCE",
                               "reviewReasons": reasons})
    return {"id": job_id, "ok": True, "segments": output,
            "languages": counts, "language": "mixed-per-utterance",
            "languageScope": "utterance", "asrPass": "VAD_UTTERANCE",
            "device": model_cache["device"],
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
