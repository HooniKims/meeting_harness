import { writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeAgentInstructions(workspacePath, { preferredAgent = "auto" } = {}) {
  const body = agentInstructionBody(preferredAgent);
  await writeFile(path.join(workspacePath, "AGENTS.md"), body, "utf8");
  await writeFile(path.join(workspacePath, "CLAUDE.md"), body, "utf8");
}

export async function writeResultReadme(workspacePath) {
  await writeFile(path.join(workspacePath, "README_결과물.md"), resultReadmeBody(), "utf8");
}

export function buildShareReadyPdfFileName(title) {
  const sanitized = String(title ?? "")
    .normalize("NFC")
    .replace(/[\x00-\x1f\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[ .]+$/g, "")
    .trim()
    .slice(0, 120);
  return `${sanitized || "meeting"}.pdf`;
}

export function selectFinalPdfFileName({ meetingInfo = {}, markdown = "" } = {}) {
  return buildShareReadyPdfFileName(selectShareReadyPdfTitle({ meetingInfo, markdown }));
}

export function selectShareReadyPdfTitle({ meetingInfo = {}, markdown = "" } = {}) {
  const markdownTitle = markdown.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim() ?? "";
  if (markdownTitle && !isGenericMeetingTitle(markdownTitle)) return markdownTitle;
  if (meetingInfo.titleSource === "inferred") return "";
  const configTitle = meetingInfo.title?.trim() ?? "";
  if (configTitle && !isGenericMeetingTitle(configTitle)) return configTitle;
  return "";
}

function isGenericMeetingTitle(title) {
  return ["회의록", "회의 보고서", "연수 보고서", "보고서"].includes(title.trim());
}

function agentInstructionBody(preferredAgent) {
  return `# 회의록 자동화 작업 지침

이 폴더는 meeting-harness가 생성한 회의록 작업 폴더입니다.

## 목표

전사문과 회의 정보를 바탕으로 학교/공공기관 내부 보고용 회의록 또는 강의/연수 요약 보고서를 작성합니다.

## 입력 파일

- 전사문: \`work/transcript.txt\`
- 전사 세그먼트: \`work/transcript.json\`
- 회의 정보: \`config/meeting_info.json\`
- 상태 파일: \`.meeting-harness/state.json\`

## 작성할 파일

- 최종 MD 원본: \`output/meeting.md\`

## 작성 원칙

- 모든 발화를 화자별로 나열하지 않습니다.
- 핵심 의견이 있는 경우에만 참석자 이름과 역할을 붙입니다.
- \`config/meeting_info.json\`의 \`contentType\`이 1인 강의/연수이면 회의 결정 사항보다 핵심 주제, 설명 흐름, 교육적 시사점, 후속 활용 방향을 중심으로 작성합니다.
- 회의 흐름, 주요 안건, 공통 의견, 이견 및 쟁점, 결정 사항, 후속 조치를 분리합니다.
- 불확실한 내용은 \`추가 확인 필요\`로 표시합니다.
- 문체는 \`~하였다\`, \`~로 정리되었다\`, \`~가 필요하다는 의견이 제시되었다\`를 기본으로 합니다.

## 긴 전사문 처리

\`work/chunks/\`가 있으면 chunk별로 먼저 요약하고, \`work/chunk_summaries/\`에 저장한 뒤 통합 회의록을 작성합니다.

## 실패 복구

사용자가 "계속해줘", "다시 해줘", "실패한 부분부터 해줘"라고 요청하면 \`.meeting-harness/state.json\`을 확인하고 실패한 단계부터 이어서 진행합니다.

## 선호 에이전트

${preferredAgent}
`;
}

function resultReadmeBody() {
  return `# 결과물 안내

## 바로 제출/공유할 파일

- \`output/<회의명>.pdf\`: 회의 제목이 있을 때 생성되는 최종 PDF입니다.
- \`output/meeting.pdf\`: 구체적인 회의 제목이 없을 때만 생성되는 최종 PDF입니다.
- \`output/meeting.docx\`: 수정 가능한 회의록 문서입니다.
- \`output/meeting.md\`: 회의록 원본 파일입니다. 수정 후 다시 보고서를 만들 수 있습니다.

## 보관하면 좋은 파일

- \`work/transcript.txt\`: 전체 전사문입니다.
- \`work/transcript.json\`: 타임스탬프와 세그먼트 정보입니다.
- \`config/meeting_info.json\`: 회의 정보입니다.
- 원본 미디어는 복사하지 않고 처음 선택한 위치의 파일을 참조합니다. 음성 추출이 끝날 때까지 원본을 이동하거나 삭제하지 마세요.

## 삭제해도 되는 파일

- \`work/chunks/\`: 긴 전사문을 나누어 처리한 중간 파일입니다.
- \`work/chunk_summaries/\`: 중간 요약 파일입니다.
- \`logs/\`: 오류 확인용 로그입니다. 문제가 없으면 삭제해도 됩니다.
- \`.meeting-harness/lock\`: 실행 잠금 파일입니다.

## 다시 만들기

\`output/meeting.md\`를 수정한 뒤 다음 명령을 실행하면 DOCX/PDF를 다시 만들 수 있습니다.

\`\`\`bash
meeting-harness render output/meeting.md
meeting-harness verify
\`\`\`
`;
}
