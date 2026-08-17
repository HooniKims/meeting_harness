# 회의록 PDF 디자인 구현 계획

> 승인 명세: `docs/superpowers/specs/2026-08-17-meeting-pdf-design.md`

목표는 기존 `meeting.md`의 내용과 순서를 유지하면서, 레퍼런스의 네이비·블루·노란 강조 체계를 적용한 A4 회의록 PDF를 생성하고 GitHub 배포본과 Windows 설치본까지 같은 결과로 검증하는 것이다.

## Task 1. 렌더링 계약을 테스트로 고정

- [ ] `test/render_report.test.js`의 실제 ReportLab/PyMuPDF 통합 테스트를 공통 헬퍼로 정리한다.
- [ ] 회의 개요 카드, 전체 요약 카드, 섹션 번호, 표, 콜아웃, 인라인 마크다운이 PDF 추출 텍스트에 올바르게 나타나는지 검증한다.
- [ ] 긴 회의록을 렌더링해 모든 페이지가 A4이고 `현재 / 전체` 페이지 번호가 출력되는지 검증한다.
- [ ] 구현 전 `node --test test/render_report.test.js`가 새 기대값에서 실패하는 것을 확인한다.

## Task 2. 공통 마크다운 파서 확장

- [ ] `workers/report_common.py`에 회의 개요의 `- 키: 값` 파싱을 추가한다.
- [ ] `workers/report_common.py`에 일반 문단·목록·마크다운 표를 구분하는 행 파서를 추가한다.
- [ ] 빈 값은 제외하고 불완전한 표는 원문 문단으로 되돌리는 경계를 유지한다.
- [ ] 파서 결과가 테스트에서 직접 검증되도록 한다.

## Task 3. PDF 테마와 렌더러 분리

- [ ] `workers/report_theme.py`에 Paperlogy 등록, 색상, 여백, 문단 스타일을 정의한다.
- [ ] `workers/report_pdf.py`에 첫 페이지 제목·정보 카드·요약 카드와 본문 섹션 Flowable을 구현한다.
- [ ] `##` 섹션 바, `###` 마름모 소제목, 불릿·번호 목록, 반복 머리행 표, 추가 확인 콜아웃을 구현한다.
- [ ] `**강조**`, `*기울임*`, 인라인 코드, 링크를 ReportLab 태그로 안전하게 변환한다.
- [ ] 두 단계 캔버스로 모든 페이지에 `01 / 전체 쪽수` 머리글과 일관된 바닥글을 그린다.
- [ ] `workers/render_report.py`는 보관·DOCX·CLI 오케스트레이션만 남기고 새 PDF 렌더러를 호출한다.

## Task 4. 회귀·실물 검증

- [ ] `node --test test/render_report.test.js`와 `npm test`를 실행한다.
- [ ] 변경된 Python 파일을 컴파일하고 저장소의 정적 품질 검사기를 실행한다.
- [ ] 실제 형식의 장문 `meeting.md`를 CLI로 렌더링하고 `verify --strict`를 통과시킨다.
- [ ] 생성 PDF의 모든 페이지를 PNG로 변환해 제목, 카드, 표, 콜아웃, 머리글·바닥글의 잘림과 겹침을 육안 확인한다.
- [ ] PDF 추출 텍스트와 링크 주석에서 마크다운 기호 제거, A4, 굵은 글꼴, 링크 대상을 확인한다.

## Task 5. 배포 및 Windows 설치

- [ ] 의도한 파일만 스테이징하고 staged diff를 검토한다.
- [ ] 전체 테스트를 한 번 더 실행한 뒤 저장소 스타일에 맞는 단일 커밋을 만든다.
- [ ] `origin/main`에 일반 push하고 원격 커밋 SHA가 로컬과 같은지 확인한다.
- [ ] `scripts/install.ps1 -Yes`로 GitHub `main` 배포본을 `%USERPROFILE%\.meeting-harness`에 설치한다.
- [ ] 설치본과 저장소의 핵심 렌더러 파일 해시가 일치하는지 확인한다.
- [ ] 설치된 `meeting-harness render`와 `verify --strict`로 최종 실사용 검증을 반복한다.

## 완료 명령

```powershell
node --test test/render_report.test.js
npm test
& "$env:USERPROFILE\.meeting-harness\venv\Scripts\python.exe" -m compileall workers
meeting-harness render output/meeting.md
meeting-harness verify . --strict
git push origin main
& .\scripts\install.ps1 -Yes
```
