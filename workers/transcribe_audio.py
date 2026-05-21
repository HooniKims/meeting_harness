from __future__ import annotations

import argparse
import json
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

    model = WhisperModel(model_name, device="auto", compute_type=compute_type)
    segments, info = model.transcribe(
        str(audio_path),
        language=language,
        vad_filter=True,
        beam_size=5,
    )

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


def format_time(seconds: float) -> str:
    total = int(seconds)
    hour, remainder = divmod(total, 3600)
    minute, second = divmod(remainder, 60)
    return f"{hour:02d}:{minute:02d}:{second:02d}"


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
