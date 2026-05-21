import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { detectAgent, runAgentToWriteMeeting } from "./agent.js";
import { writeAgentInstructions, writeResultReadme } from "./artifacts.js";
import { parseMeetingInfoText } from "./core.js";
import { createWorkspace, readState, writeState } from "./workspace.js";
import { extractAudio, runPythonWorker, transcribeAudio } from "./processes.js";

const infoFileNames = [
  "meeting_info.txt",
  "meeting_info.md",
  "회의정보.txt",
  "회의정보.md",
  "speakers.txt",
  "참석자.txt"
];

export async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "run") return runCommand(rest);
  if (command === "setup") return setupCommand();
  if (command === "render") return renderCommand(rest);
  if (command === "verify") return verifyCommand(rest);
  if (command === "resume") return resumeCommand(rest);
  if (command === "rerun") return resumeCommand(rest);

  throw new Error(`알 수 없는 명령입니다: ${command}`);
}

async function runCommand(args) {
  const { positional, options } = parseArgs(args);
  if (!positional.length) throw new Error("입력 미디어 파일 경로가 필요합니다.");

  const baseDir = options["base-dir"] ? path.resolve(options["base-dir"]) : process.cwd();
  const inputFiles = positional.map((item) => path.resolve(item));

  console.log("[1/7] 작업 폴더 생성");
  const workspace = await createWorkspace({ inputFiles, baseDir });

  await collectMeetingInfo({ sourceDir: baseDir, workspacePath: workspace.path });
  const preferredAgent = options.agent ?? "auto";
  const detectedAgent = detectAgent({ preferred: preferredAgent }) ?? "auto";
  await writeAgentInstructions(workspace.path, { preferredAgent: detectedAgent });
  await writeResultReadme(workspace.path);

  if (options["skip-media"]) {
    await writeFile(path.join(workspace.path, "work", "transcript.txt"), "", "utf8");
    await writeFile(path.join(workspace.path, "work", "transcript.json"), "[]\n", "utf8");
  } else {
    console.log("[2/7] 음성 추출");
    await extractAudio(workspace.path);
    console.log("[3/7] 전사");
    await transcribeAudio(workspace.path, {
      model: options.model ?? "large-v3",
      computeType: options["compute-type"] ?? "auto",
      language: options.language ?? "ko"
    });
  }

  if (!options["skip-agent"]) {
    console.log("[4/7] 회의록 작성");
    const selectedAgent = await runAgentToWriteMeeting({ agent: preferredAgent, workspacePath: workspace.path });
    console.log(`[4/7] 회의록 작성 완료: ${selectedAgent}`);
    console.log("[5/7] DOCX/PDF 생성");
    await renderCommand([path.join(workspace.path, "output", "meeting.md")]);
    console.log("[7/7] 생성 결과 검증");
    await verifyCommand([workspace.path]);
  } else {
    await writeMeetingTemplate(workspace.path);
  }

  await writeState(workspace.path, {
    ...(await readState(workspace.path)),
    status: "ready",
    current_step: options["skip-agent"] ? "ready_for_agent" : "complete",
    completed_steps: options["skip-agent"]
      ? ["create_workspace", "collect_meeting_info", "prepare_agent_files"]
      : ["create_workspace", "collect_meeting_info", "prepare_agent_files", "agent_write_md", "render", "verify"],
    artifacts: {
      workspace: workspace.path,
      meeting_info: "config/meeting_info.json",
      transcript: "work/transcript.txt",
      meeting_md: "output/meeting.md",
      meeting_docx: "output/meeting.docx",
      meeting_pdf: "output/meeting.pdf",
      verification_report: "output/verification_report.md"
    }
  });

  console.log(`작업 폴더: ${workspace.path}`);
  console.log(options["skip-agent"] ? "다음 단계: meeting-harness resume 또는 meeting-harness render output/meeting.md" : "완료: README_결과물.md를 확인하세요.");
  return workspace.path;
}

async function setupCommand() {
  console.log("meeting-harness setup");
  console.log(`Node.js: ${process.version}`);
  console.log(`Codex CLI: ${detectAgent({ preferred: "codex" }) ? "감지됨" : "없음"}`);
  console.log(`Claude CLI: ${detectAgent({ preferred: "claude" }) ? "감지됨" : "없음"}`);
  console.log(`기본 에이전트: ${detectAgent() ?? "없음"}`);
  console.log("Python, ffmpeg, Whisper/DOCX/PDF 패키지는 installer와 실행 단계에서 점검합니다.");
}

async function renderCommand(args) {
  const { positional, options } = parseArgs(args);
  const input = positional[0] ?? "output/meeting.md";
  await runPythonWorker("render_report.py", ["--input", input, "--output-dir", options["output-dir"] ?? path.dirname(input)]);
}

async function verifyCommand(args) {
  const { positional, options } = parseArgs(args);
  const workdir = positional[0] ?? process.cwd();
  const workerArgs = ["--workdir", workdir];
  if (options.strict) workerArgs.push("--strict");
  await runPythonWorker("verify_report.py", workerArgs);
}

async function resumeCommand(args) {
  const { positional, options } = parseArgs(args);
  const workspacePath = path.resolve(positional[0] ?? process.cwd());
  const state = await readState(workspacePath);
  const step = options.from ?? options.step ?? state.failed_step ?? state.current_step;

  if (step === "verify") {
    await verifyCommand([workspacePath]);
    return;
  }
  if (step === "render" || step === "ready_for_render") {
    await renderCommand([path.join(workspacePath, "output", "meeting.md")]);
    await verifyCommand([workspacePath]);
    return;
  }

  console.log(`재개할 단계: ${step}`);
  console.log("현재 1차 구현에서는 render/verify 단계 재개를 지원합니다.");
}

async function collectMeetingInfo({ sourceDir, workspacePath }) {
  let combined = "";
  for (const name of infoFileNames) {
    try {
      combined += `\n${await readFile(path.join(sourceDir, name), "utf8")}`;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const parsed = parseMeetingInfoText(combined);
  const info = {
    title: parsed.title ?? path.basename(workspacePath),
    dateTime: parsed.dateTime ?? "",
    location: parsed.location ?? "",
    attendees: parsed.attendees ?? [],
    agenda: parsed.agenda ?? [],
    audience: parsed.audience ?? "",
    tone: parsed.tone ?? "학교/공공기관 내부 보고용 공식 문체",
    notes: parsed.notes ?? ""
  };
  await mkdir(path.join(workspacePath, "config"), { recursive: true });
  await writeFile(path.join(workspacePath, "config", "meeting_info.json"), JSON.stringify(info, null, 2), "utf8");
  return info;
}

async function writeMeetingTemplate(workspacePath) {
  const template = `# 회의록

## 회의 개요
- 회의명:
- 일시:
- 장소:
- 참석자:

## 전체 요약

## 회의 흐름

## 주요 안건별 논의

## 공통 의견

## 이견 및 쟁점

## 결정 사항

## 후속 조치

## 참고: 핵심 발언
`;
  await mkdir(path.join(workspacePath, "output"), { recursive: true });
  await writeFile(path.join(workspacePath, "output", "meeting.md"), template, "utf8");
}

function parseArgs(args) {
  const positional = [];
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item.startsWith("--")) {
      const key = item.slice(2);
      const next = args[index + 1];
      if (!next || next.startsWith("--")) {
        options[key] = true;
      } else {
        options[key] = next;
        index += 1;
      }
    } else {
      positional.push(item);
    }
  }
  return { positional, options };
}

function printHelp() {
  console.log(`meeting-harness

사용법:
  meeting-harness setup
  meeting-harness run <media-file...> [--base-dir DIR] [--skip-media] [--skip-agent]
  meeting-harness render output/meeting.md
  meeting-harness verify [작업폴더] [--strict]
  meeting-harness resume [작업폴더]

주요 명령:
  meeting-harness run      작업 폴더를 만들고 전사/에이전트/렌더 준비를 시작합니다.
  meeting-harness render   meeting.md를 DOCX/PDF로 렌더링합니다.
  meeting-harness verify   생성 결과 검증 보고서를 만듭니다.
`);
}
