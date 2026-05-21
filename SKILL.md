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
npm install -g meeting-harness
```

or use the project bootstrap installer if one is available.

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

If one exists, let the CLI use it. If the CLI asks for missing fields, answer only from user-provided context. Do not invent meeting metadata.

## Running A New Job

Use:

```bash
meeting-harness run "<media-file>"
```

For lower-resource test runs only, model options may be used:

```bash
meeting-harness run "<media-file>" --model tiny --compute-type int8
```

For normal use, prefer quality-first defaults.

## Expected Outputs

After success, point the user to:

```text
README_결과물.md
output/meeting.md
output/meeting.docx
output/meeting.pdf
output/verification_report.md
```

Explain briefly:

- `meeting.pdf`: sharing/submission file
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

## After Editing meeting.md

If the user edits `output/meeting.md` and asks to regenerate the report:

```bash
meeting-harness render output/meeting.md
meeting-harness verify . --strict
```

If running from outside the workspace, pass the full path to `meeting.md` and the workspace path to `verify`.

## Response Style

Keep updates concise and concrete. Show the current step, command outcome, working folder, and final output files. Do not explain internal implementation details unless the user asks.
