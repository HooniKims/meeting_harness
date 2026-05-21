# meeting-harness

회의 녹화 파일이나 음성 파일을 넣으면 로컬 Whisper 전사, 회의록 Markdown 작성, DOCX/PDF 보고서 생성, 결과 검증까지 이어서 처리하는 CLI/skill 하네스입니다.

## 무엇을 해주나요?

- 원본 영상/음성 파일은 그대로 보존합니다.
- 작업 폴더를 따로 만들고 그 안에서 처리합니다.
- 영상 파일이면 ffmpeg로 음성을 추출합니다.
- 로컬 faster-whisper로 전사합니다.
- Codex 또는 Claude가 회의 맥락을 정리할 수 있도록 작업 파일을 준비합니다.
- `meeting.md`를 기준으로 A4 가로형 DOCX/PDF 회의록을 만듭니다.
- 마지막에 결과물이 제대로 만들어졌는지 검증 보고서를 만듭니다.

## 설치 방법

Windows PowerShell에서 실행합니다.

```powershell
irm https://raw.githubusercontent.com/HooniKims/meeting_harness/main/scripts/install.ps1 | iex
```

macOS 또는 Linux 터미널에서 실행합니다.

```bash
curl -fsSL https://raw.githubusercontent.com/HooniKims/meeting_harness/main/scripts/install.sh | bash
```

설치 스크립트는 가능한 범위에서 다음 항목을 확인하고 설치를 도와줍니다.

- Node.js와 npm
- Python
- ffmpeg
- faster-whisper
- DOCX/PDF 생성에 필요한 Python 패키지
- `meeting-harness` CLI
- `meeting-harness` skill

이 프로젝트는 npm 패키지로 공개 배포하지 않습니다. npm은 `npx skills@latest`를 실행하기 위한 도구로만 사용합니다. 실제 CLI 설치는 GitHub ZIP installer가 처리합니다.

Python 패키지는 전역 Python에 설치하지 않습니다. installer는 하네스 전용 가상환경을 만들고 그 안에만 필요한 패키지를 설치합니다.

```text
~/.meeting-harness/venv
```

Windows에서는 다음 위치를 사용합니다.

```text
%USERPROFILE%\.meeting-harness\venv
```

설치 후 새 터미널을 열고 확인합니다.

```bash
meeting-harness --help
```

## 기본 사용법

회의 영상 또는 음성 파일이 있는 폴더로 이동합니다.

```bash
cd path/to/meeting-folder
```

CLI로 직접 실행할 수 있습니다.

```bash
meeting-harness run meeting.mp4
```

여러 파일이면 순서대로 넣습니다.

```bash
meeting-harness run part1.mp4 part2.mp4 part3.mp4
```

Codex나 Claude에서 skill처럼 사용할 수도 있습니다.

```text
$meeting-harness 이 폴더의 회의 녹화 파일로 회의록 작성해줘.
$meeting-harness 음성 파일로 회의록 만들어줘.
$meeting-harness 실패한 부분부터 계속해줘.
$meeting-harness meeting.md 수정했으니 DOCX와 PDF 다시 만들어줘.
```

## 발화자/회의 정보 입력

회의 파일과 같은 폴더에 다음 파일 중 하나를 넣어두면 회의 맥락 보정에 활용합니다.

```text
meeting_info.txt
meeting_info.md
회의정보.txt
회의정보.md
speakers.txt
참석자.txt
```

예시:

```text
회의명: 2026학년도 교육과정 협의회
일시: 2026-05-21
참석자:
- 김OO: 교무부장
- 이OO: 연구부장
- 박OO: 3학년 담임

참고:
- 핵심 의견이 있을 때만 발화자 이름과 역할을 함께 표시한다.
- 회의록은 일반 보고서 형태로 정리한다.
```

발화자 정보는 전사 문장을 모두 이름표로 바꾸는 용도가 아닙니다. 회의 요약, 맥락 보정, 핵심 의견 attribution에만 사용합니다.

## 결과물

작업이 끝나면 생성된 작업 폴더 안에서 다음 파일을 확인합니다.

```text
README_결과물.md
output/meeting.md
output/meeting.docx
output/meeting.pdf
output/verification_report.md
```

각 파일의 의미는 다음과 같습니다.

- `meeting.pdf`: 제출하거나 공유하기 좋은 최종 보고서
- `meeting.docx`: Word에서 수정 가능한 보고서
- `meeting.md`: 이후 수정의 기준이 되는 원본 회의록
- `verification_report.md`: 결과물 생성 상태를 확인한 검증 보고서
- `README_결과물.md`: 초보자를 위한 결과물 설명서

## 다시 실행하기

중간에 실패했거나 이어서 실행하고 싶으면 다음 명령을 사용합니다.

```bash
meeting-harness resume
```

Markdown을 직접 수정한 뒤 DOCX/PDF만 다시 만들고 싶으면 다음처럼 실행합니다.

```bash
meeting-harness render output/meeting.md
meeting-harness verify
```

## 업데이트

GitHub에 새 버전이 올라오면 설치 명령을 다시 실행하면 됩니다.

Windows:

```powershell
irm https://raw.githubusercontent.com/HooniKims/meeting_harness/main/scripts/install.ps1 | iex
```

macOS/Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/HooniKims/meeting_harness/main/scripts/install.sh | bash
```

강제로 다시 설치하려면 다음 옵션을 사용할 수 있습니다.

Windows:

```powershell
.\scripts\install.ps1 -Force
```

macOS/Linux:

```bash
FORCE=1 ./scripts/install.sh
```

## 주의할 점

- 긴 회의는 전사 시간이 오래 걸릴 수 있습니다.
- 전사 품질을 우선하기 때문에 빠른 처리보다 정확도를 우선합니다.
- PDF/DOCX 보고서 디자인은 프로젝트에 포함된 렌더링 로직을 기준으로 생성됩니다.
- 원본 파일은 직접 수정하지 않습니다.
