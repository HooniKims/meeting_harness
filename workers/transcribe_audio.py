from __future__ import annotations

import argparse
import json
import time
from pathlib import Path


def transcribe(audio_path: Path, output_txt: Path, output_json: Path, model_name: str, compute_type: str, language: str) -> None:
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise SystemExit(
            "faster-whisper가 설치되어 있지 않습니다. "
            "python -m pip install faster-whisper 명령으로 설치한 뒤 다시 실행하세요."
        ) from exc

    if not audio_path.exists():
        raise SystemExit(f"오디오 파일을 찾을 수 없습니다: {audio_path}")

    started_at = time.monotonic()
    print(f"전사 준비: model={model_name}, compute={compute_type}, language={language}", flush=True)
    print("Whisper 모델을 불러오는 중입니다. 첫 실행은 모델 다운로드/로딩 때문에 시간이 걸릴 수 있습니다.", flush=True)
    model = WhisperModel(model_name, device="auto", compute_type=compute_type)
    segments, info = model.transcribe(
        str(audio_path),
        language=language,
        vad_filter=True,
        beam_size=5,
    )

    duration = float(info.duration or 0)
    if duration > 0:
        print(f"전사 시작: 전체 오디오 길이 {format_time(duration)}", flush=True)
    else:
        print("전사 시작: 전체 오디오 길이를 확인하지 못했습니다.", flush=True)

    rows = []
    text_lines = []
    for index, segment in enumerate(segments, start=1):
        row = {
            "index": index,
            "start": round(float(segment.start), 3),
            "end": round(float(segment.end), 3),
            "text": segment.text.strip(),
        }
        rows.append(row)
        if row["text"]:
            text_lines.append(f"[{format_time(row['start'])}-{format_time(row['end'])}] {row['text']}")
        print_transcribe_progress(index, row["end"], duration, started_at)

    if not text_lines:
        text_lines.append("[00:00:00-00:00:00] 감지된 발화가 없습니다. Whisper 전사는 정상 실행되었으나 음성 내용이 비어 있거나 발화로 인식되지 않았습니다.")

    output_txt.parent.mkdir(parents=True, exist_ok=True)
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_txt.write_text("\n".join(text_lines) + "\n", encoding="utf-8")
    output_json.write_text(
        json.dumps(
            {
                "language": info.language,
                "language_probability": info.language_probability,
                "duration": info.duration,
                "model": model_name,
                "compute_type": compute_type,
                "segments": rows,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"전사 완료: {len(rows)}개 구간, 경과 {format_elapsed(time.monotonic() - started_at)}", flush=True)


def print_transcribe_progress(index: int, current_seconds: float, duration: float, started_at: float) -> None:
    elapsed_seconds = time.monotonic() - started_at
    elapsed = format_elapsed(elapsed_seconds)
    current = format_time(current_seconds)
    if duration > 0:
        percent = min(100.0, max(0.0, (current_seconds / duration) * 100))
        total = format_time(duration)
        remaining_audio = format_time(max(0.0, duration - current_seconds))
        eta = estimate_remaining(elapsed_seconds, current_seconds, duration)
        print(
            f"전사 진행: {percent:5.1f}% | 현재 {current} / 전체 {total} | "
            f"남은 음성 {remaining_audio} | 예상 남은 시간 {eta} | 구간 {index}개",
            flush=True,
        )
    else:
        print(f"전사 진행: {current}까지 처리 | 구간 {index}개 | 경과 {elapsed}", flush=True)


def format_time(seconds: float) -> str:
    total = int(seconds)
    hour, remainder = divmod(total, 3600)
    minute, second = divmod(remainder, 60)
    return f"{hour:02d}:{minute:02d}:{second:02d}"


def format_elapsed(seconds: float) -> str:
    total = int(seconds)
    minute, second = divmod(total, 60)
    hour, minute = divmod(minute, 60)
    if hour:
        return f"{hour}시간 {minute}분 {second}초"
    if minute:
        return f"{minute}분 {second}초"
    return f"{second}초"


def estimate_remaining(elapsed_seconds: float, current_seconds: float, duration: float) -> str:
    if current_seconds <= 0 or duration <= current_seconds:
        return "계산 중"
    estimated_total = elapsed_seconds * (duration / current_seconds)
    remaining = max(0.0, estimated_total - elapsed_seconds)
    return format_elapsed(remaining)


def main() -> int:
    parser = argparse.ArgumentParser(description="faster-whisper로 회의 음성을 전사합니다.")
    parser.add_argument("--audio", required=True, help="입력 WAV/음성 파일")
    parser.add_argument("--output-txt", required=True, help="전사 TXT 출력 경로")
    parser.add_argument("--output-json", required=True, help="전사 JSON 출력 경로")
    parser.add_argument("--model", default="large-v3", help="Whisper 모델명")
    parser.add_argument("--compute-type", default="auto", help="float16, int8, auto 등")
    parser.add_argument("--language", default="ko", help="전사 언어")
    args = parser.parse_args()

    transcribe(
        Path(args.audio).resolve(),
        Path(args.output_txt).resolve(),
        Path(args.output_json).resolve(),
        args.model,
        args.compute_type,
        args.language,
    )
    print(f"전사 TXT 생성: {Path(args.output_txt).resolve()}")
    print(f"전사 JSON 생성: {Path(args.output_json).resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
