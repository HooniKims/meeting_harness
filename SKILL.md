---
name: meeting-harness
description: Use when the user asks to create meeting minutes, 회의록, meeting reports, DOCX/PDF reports, or says they added a video/audio recording and wants it transcribed and summarized. Trigger on requests like "동영상 파일 넣었으니 회의록 작성해줘", "음성 파일로 회의록 만들어줘", "회의록 PDF/DOCX 다시 만들어줘", "실패한 부분부터 계속해줘", or "$meeting-harness ...". Uses the local meeting-harness CLI to preserve originals, transcribe with local Whisper, create meeting.md, render DOCX/PDF, and verify outputs.
---

# Meeting Harness

Use this skill to run the `meeting-harness` CLI for meeting recording workflows.

## Core Rule

Prefer the CLI as the execution engine. This skill interprets the user's request, chooses the right `meeting-harness` command, runs it in the target folder, and reports only useful progress and output locations.

Never edit or move the original media file. The CLI creates a timestamped working folder and copies the original into `input/`.

## Before Running

1. Work in the folder that contains the user's video or audio file, unless the user gives another path.
2. Check whether `meeting-harness` is available:

```bash
meeting-harness --help
```

3. If missing, tell the user to install the CLI first:

```bash
irm https://raw.githubusercontent.com/HooniKims/meeting_harness/main/scripts/install.ps1 | iex
```

For macOS/Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/HooniKims/meeting_harness/main/scripts/install.sh | bash
```

## Trigger Mapping

Use these mappings:

- New minutes from video/audio: `meeting-harness run <media-file>`
- Multiple media files: pass all files in intended order, or ask for order when unclear.
- Continue after failure: `meeting-harness resume [workspace]`
- Rebuild DOCX/PDF after editing MD: `meeting-harness render output/meeting.md` then `meeting-harness verify`
- Check outputs: `meeting-harness verify [workspace] --strict`
- Environment check: `meeting-harness setup`

## Media Selection

Supported inputs include common video and audio formats such as:

```text
mp4 mov mkv webm avi m4v wmv mpg mpeg ts
mp3 m4a wav flac aac ogg opus wma aiff
```

If exactly one likely media file exists in the current folder, use it.

If several likely media files exist and their order is clear from names such as `part1`, `part2`, `1`, `2`, date, or time, use that order.

If several likely media files exist and order is unclear, ask the user for the order before running.

### Windows multiple-media guard

When multiple media files are passed on Windows, do not assume a long transcription is correct until the audio duration is plausible. The current CLI concatenates `input/original_01.*`, `input/original_02.*`, and later inputs into `work/audio.wav` in file order, but after `[3/7] 전사` starts, compare the logged total audio duration or `work/audio.wav` duration with the sum of the source media durations when practical.

If the duration matches only the first file, stop only the current harness process, create a separate combined WAV with `ffmpeg concat`, verify its duration, and rerun `meeting-harness run "<combined.wav>" --profile balanced --no-prompt`. Never modify the original media.

## Meeting Info Files

The CLI automatically looks for:

```text
meeting_info.txt
meeting_info.md
회의정보.txt
회의정보.md
speakers.txt
참석자.txt
```

If one exists, let the CLI use it. `참석자:` and `주요 안건:` may be written either on one line or as bullet lists under the field name. If the CLI asks for missing fields, answer only from user-provided context. Do not invent meeting metadata.

If the CLI fails because meeting information is missing in a non-interactive shell, stop and ask the user for the missing fields. Then create `meeting_info.txt` in the media folder and rerun the same command. Required fields are:

- 자료 유형
- 제목/회의명
- 참석자/발화자 정보
- 특이사항, if any

If no meeting info file exists and the format is unclear, ask the user briefly before running when the chat context allows it:

- Is this a meeting, a one-person lecture/training, or another format?
- Who are the key speaker(s) or participant roles, if known?
- Are there any context notes that should affect the summary?

If it is clearly a one-person lecture/training from the file name or folder name, confirm the inference briefly and proceed unless the user corrects it.

If the user is not available or the CLI is running non-interactively, proceed with the CLI defaults. File names containing `강의`, `연수`, `수업`, `특강`, `워크숍`, or `세미나` should be treated as likely one-person lecture/training unless the user says otherwise.

### Noninteractive metadata guard

In noninteractive PowerShell, `meeting_info.txt` may still produce "회의 정보가 부족합니다." if fields are incomplete or malformed. If the user already provided the required metadata, fix or create `meeting_info.txt`, rerun with `--no-prompt`, then inspect `config/meeting_info.json`.

If the CLI defaulted the title or attendees, prefer the title, date, attendees, and notes the user gave in chat when writing `output/meeting.md`.

## Running A New Job

Use:

```bash
meeting-harness run "<media-file>"
```

If the same media file already has a failed or in-progress workspace, `run` will reuse that workspace instead of creating another timestamped folder. Use `--new` only when the user explicitly wants a fresh independent run.

For long recordings or CPU-only machines, use a balanced profile:

```bash
meeting-harness run "<media-file>" --profile balanced
```

For lower-resource test runs only, model options may be used:

```bash
meeting-harness run "<media-file>" --model tiny --compute-type int8
```

For normal use, prefer the CLI's `auto` profile. It recommends settings from the local hardware profile.

## Expected Outputs

After success, point the user to:

```text
README_결과물.md
output/meeting.md
output/meeting.docx
output/meeting.pdf
output/<회의명 또는 연수명>.pdf
output/verification_report.md
```

Explain briefly:

- `meeting.pdf`: sharing/submission file
- `<회의명 또는 연수명>.pdf`: share-ready PDF copy created after verification, when a title is available
- `meeting.docx`: editable report
- `meeting.md`: canonical source for future edits
- `verification_report.md`: output health check
- `README_결과물.md`: beginner-friendly file guide

## Failure Recovery

If the user says "계속해줘", "다시 해줘", "실패한 부분부터 해줘", or similar, run:

```bash
meeting-harness resume
```

If they point to a specific workspace:

```bash
meeting-harness resume "<workspace-path>"
```

Use `.meeting-harness/state.json` only to understand the current state. Do not manually rewrite it unless fixing a clear harness bug.

If no workspace was created because meeting information was missing, ask the user for the missing meeting info first instead of running `resume`.

### Stale state guard

During long transcription, `.meeting-harness/state.json` can lag behind the real step. Prefer stdout progress logs, live Python/ffmpeg/node processes, and the existence of `work/transcript.txt` / `work/transcript.json` over the `current_step` field.

### Agent failure recovery

If transcription succeeds but report generation fails with `spawn codex ENOENT`, do not restart transcription. Treat it as an agent launch failure. Use `work/transcript.txt` and `work/transcript.json` to author `output/meeting.md` manually, then run:

```bash
meeting-harness render output/meeting.md
meeting-harness verify . --strict
```

### Strict verification guard

For manual `meeting.md`, include nonempty body text directly under all required top-level sections: `회의 개요`, `전체 요약`, `회의 흐름`, `주요 안건별 논의`, `공통 의견`, `이견 및 쟁점`, `결정 사항`, `후속 조치`. Do not leave a required section with only nested headings or bullets.

## After Editing meeting.md

If the user edits `output/meeting.md` and asks to regenerate the report:

```bash
meeting-harness render output/meeting.md
meeting-harness verify . --strict
```

If running from outside the workspace, pass the full path to `meeting.md` and the workspace path to `verify`.

After rendering, check the PDF page flow when practical. If pages advance while large bottom space remains, inspect the renderer for forced page breaks or over-aggressive keep-together behavior, then rerender and verify again. The PDF renderer should not insert arbitrary fixed-interval page breaks such as "every 4 sections"; content should flow naturally except for unavoidable heading/body grouping.

After strict verification passes, keep the canonical `output/meeting.pdf` for harness compatibility. When a user-provided meeting or training title is available, also use the title-named PDF copy in `output/` for sharing. Windows-invalid filename characters (`\ / : * ? " < > |`) are sanitized automatically. Do not delete or move `output/meeting.pdf`, `output/meeting.docx`, or `output/meeting.md`.

When searching transcript timestamps in PowerShell, prefer `Select-String -SimpleMatch` or `[regex]::Escape()` over `-like "[$time*"` because `[` is a wildcard character in PowerShell patterns.

## Response Style

Keep updates concise and concrete. Show the current step, command outcome, working folder, and final output files. Do not explain internal implementation details unless the user asks.
