import { spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { detectAgent, runAgentToWriteMeeting } from "./agent.js";
import { createShareReadyPdfCopy, writeAgentInstructions, writeResultReadme } from "./artifacts.js";
import { detectHardwareProfile, getConfigPath, normalizeTranscriptionProfile, readHarnessConfig, recommendTranscriptionSettings, writeHarnessConfig } from "./config.js";
import { parseMeetingInfoText } from "./core.js";
import { createWorkspace, findReusableWorkspace, readState, writeState } from "./workspace.js";
import { extractAudio, resolvePythonCommand, runPythonWorker, transcribeAudio } from "./processes.js";

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
  if (command === "setup") return setupCommand(rest);
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
  const transcriptionDefaults = await getTranscriptionDefaults(options.profile);

  if (!options.new && !options["force-new"]) {
    const reusableWorkspace = await findReusableWorkspace({ inputFiles, baseDir });
    if (reusableWorkspace) {
      console.log(`[1/7] 기존 작업 폴더 재사용: ${reusableWorkspace}`);
      console.log("같은 입력 파일의 실패/진행 중 작업을 발견해 새 폴더를 만들지 않고 이어서 실행합니다.");
      return resumeCommand([reusableWorkspace, ...forwardResumeOptions(options)]);
    }
  }

  await preflightRun(options);
  await preflightMeetingInfo({ sourceDir: baseDir, inputFiles, options });

  console.log("[1/7] 작업 폴더 생성");
  const workspace = await createWorkspace({ inputFiles, baseDir });
  let activeStep = "create_workspace";

  try {
    await writeState(workspace.path, {
      ...(await readState(workspace.path)),
      run_options: {
        skip_agent: Boolean(options["skip-agent"]),
        skip_media: Boolean(options["skip-media"]),
        agent: options.agent ?? "auto",
        profile: options.profile ?? transcriptionDefaults.profile,
        model: options.model ?? transcriptionDefaults.model,
        compute_type: options["compute-type"] ?? transcriptionDefaults.computeType,
        language: options.language ?? transcriptionDefaults.language
      }
    });
    activeStep = "collect_meeting_info";
    await collectMeetingInfo({ sourceDir: baseDir, workspacePath: workspace.path, inputFiles, options });
    await markCompleted(workspace.path, activeStep);
    const preferredAgent = options.agent ?? "auto";
    const detectedAgent = detectAgent({ preferred: preferredAgent }) ?? "auto";
    activeStep = "prepare_agent_files";
    await writeAgentInstructions(workspace.path, { preferredAgent: detectedAgent });
    await writeResultReadme(workspace.path);
    await markCompleted(workspace.path, activeStep);

    if (options["skip-media"]) {
      activeStep = "transcribe";
      await writeFile(path.join(workspace.path, "work", "transcript.txt"), "", "utf8");
      await writeFile(path.join(workspace.path, "work", "transcript.json"), "[]\n", "utf8");
      await markCompleted(workspace.path, activeStep);
    } else {
      console.log("[2/7] 음성 추출");
      activeStep = "extract_audio";
      await markStarted(workspace.path, activeStep);
      await extractAudio(workspace.path);
      await markCompleted(workspace.path, activeStep);
      console.log("[3/7] 전사");
      activeStep = "transcribe";
      await markStarted(workspace.path, activeStep);
      await transcribeAudio(workspace.path, {
        model: options.model ?? transcriptionDefaults.model,
        computeType: options["compute-type"] ?? transcriptionDefaults.computeType,
        language: options.language ?? transcriptionDefaults.language
      });
      await markCompleted(workspace.path, activeStep);
    }

    if (!options["skip-agent"]) {
      console.log("[4/7] 회의록 작성");
      activeStep = "agent_write_md";
      await markStarted(workspace.path, activeStep);
      const selectedAgent = await runAgentToWriteMeeting({ agent: preferredAgent, workspacePath: workspace.path });
      await markCompleted(workspace.path, activeStep);
      console.log(`[4/7] 회의록 작성 완료: ${selectedAgent}`);
      console.log("[5/7] DOCX/PDF 생성");
      activeStep = "render";
      await markStarted(workspace.path, activeStep);
      await renderCommand([path.join(workspace.path, "output", "meeting.md")]);
      await markCompleted(workspace.path, activeStep);
      console.log("[7/7] 생성 결과 검증");
      activeStep = "verify";
      await markStarted(workspace.path, activeStep);
      await verifyCommand([workspace.path]);
      await markCompleted(workspace.path, activeStep);
    } else {
      activeStep = "ready_for_agent";
      await writeMeetingTemplate(workspace.path);
    }

    await writeState(workspace.path, {
      ...(await readState(workspace.path)),
      status: "ready",
      current_step: options["skip-agent"] ? "ready_for_agent" : "complete",
      failed_step: null,
      artifacts: defaultArtifacts(workspace.path)
    });
  } catch (error) {
    await markFailed(workspace.path, activeStep, error);
    throw error;
  }

  console.log(`작업 폴더: ${workspace.path}`);
  console.log(options["skip-agent"] ? "다음 단계: meeting-harness resume 또는 meeting-harness render output/meeting.md" : "완료: README_결과물.md를 확인하세요.");
  return workspace.path;
}

async function preflightMeetingInfo({ sourceDir, inputFiles = [], options = {} }) {
  if (process.stdin.isTTY || options.yes || options["no-prompt"]) return;
  let combined = "";
  let foundInfoFile = false;
  for (const name of infoFileNames) {
    try {
      combined += `\n${await readFile(path.join(sourceDir, name), "utf8")}`;
      foundInfoFile = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const parsed = parseMeetingInfoText(combined);
  const inferred = inferMeetingInfo({ sourceDir, workspacePath: sourceDir, inputFiles });
  const needsInfo = !foundInfoFile || !parsed.contentType || !parsed.attendees?.length;
  const canAutoConfirmLecture = !foundInfoFile && inferred.confidence === "high" && inferred.contentType === "1인 강의/연수";
  if (needsInfo && !canAutoConfirmLecture) {
    throw new Error(missingMeetingInfoMessage());
  }
}

async function setupCommand(args = []) {
  const { options } = parseArgs(args);
  const selectedProfile = normalizeTranscriptionProfile(options.profile ?? "auto");
  console.log("meeting-harness setup");
  console.log(`Node.js: ${process.version}`);
  console.log(`Codex CLI: ${detectAgent({ preferred: "codex" }) ? "감지됨" : "없음"}`);
  console.log(`Claude CLI: ${detectAgent({ preferred: "claude" }) ? "감지됨" : "없음"}`);
  console.log(`기본 에이전트: ${detectAgent() ?? "없음"}`);
  const profile = detectHardwareProfile();
  const recommendation = recommendTranscriptionSettings(profile, { profile: selectedProfile });
  const config = {
    transcription: recommendation,
    hardware: profile,
    updatedAt: new Date().toISOString()
  };
  await writeHarnessConfig(config);
  console.log(`시스템 메모리: ${profile.totalMemoryGb}GB`);
  console.log(`CPU 코어: ${profile.cpuCount}`);
  console.log(`GPU: ${profile.gpu ? `${profile.gpu.name} (${profile.gpu.memoryGb}GB)` : "NVIDIA GPU 감지 안 됨"}`);
  console.log(`전사 프로필: ${recommendation.profile}`);
  console.log(`전사 모델 추천: ${recommendation.model}`);
  console.log(`연산 설정 추천: ${recommendation.computeType}`);
  console.log(`언어 기본값: ${recommendation.language}`);
  console.log(`설정 저장: ${getConfigPath()}`);
  console.log("Python, ffmpeg, Whisper/DOCX/PDF 패키지는 installer와 실행 단계에서 점검합니다.");
}

async function getTranscriptionDefaults(requestedProfile) {
  if (requestedProfile) {
    return recommendTranscriptionSettings(detectHardwareProfile(), { profile: requestedProfile });
  }
  const config = await readHarnessConfig();
  if (config.transcription?.model && config.transcription?.computeType) {
    return {
      model: config.transcription.model,
      computeType: config.transcription.computeType,
      language: config.transcription.language ?? "ko",
      profile: config.transcription.profile ?? config.transcription.policy ?? "auto"
    };
  }
  return recommendTranscriptionSettings();
}

async function preflightRun(options = {}) {
  if (options["skip-media"] && options["skip-agent"]) return;

  const problems = [];
  if (!options["skip-media"] && !commandWorks("ffmpeg", ["-version"])) {
    problems.push("ffmpeg를 찾을 수 없습니다. installer를 다시 실행해 ffmpeg를 설치하세요.");
  }

  const python = resolvePythonCommand();
  if (!commandWorks(python.command, [...python.prefixArgs, "--version"])) {
    problems.push("Python 실행 환경을 찾을 수 없습니다. installer를 다시 실행해 하네스 전용 Python 환경을 만드세요.");
  }

  if (!options["skip-media"] && commandWorks(python.command, [...python.prefixArgs, "--version"])) {
    const importCheck = spawnSync(
      python.command,
      [...python.prefixArgs, "-c", "import faster_whisper, docx, reportlab"],
      { encoding: "utf8" }
    );
    if (importCheck.status !== 0) {
      problems.push("Whisper/DOCX/PDF Python 패키지가 하네스 Python 환경에 설치되어 있지 않습니다. installer를 다시 실행하세요.");
    }
  }

  if (problems.length) {
    throw new Error(["실행 전 환경 점검 실패:", ...problems.map((item) => `- ${item}`)].join("\n"));
  }
}

function commandWorks(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return !result.error && result.status === 0;
}

function forwardResumeOptions(options = {}) {
  const args = [];
  for (const key of ["model", "compute-type", "language", "agent", "profile"]) {
    if (options[key] && options[key] !== true) args.push(`--${key}`, options[key]);
  }
  for (const key of ["skip-agent", "skip-media"]) {
    if (options[key]) args.push(`--${key}`);
  }
  return args;
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
  const shareReadyPdf = await createShareReadyPdfCopy(path.resolve(workdir));
  if (shareReadyPdf) console.log(`공유용 PDF 사본 생성: ${shareReadyPdf}`);
}

async function resumeCommand(args) {
  const { positional, options } = parseArgs(args);
  const workspacePath = path.resolve(positional[0] ?? (await findLatestWorkspace(process.cwd())) ?? process.cwd());
  const state = await readState(workspacePath);
  const step = options.from ?? options.step ?? state.failed_step ?? state.current_step;

  console.log(`작업 폴더: ${workspacePath}`);
  console.log(`재개할 단계: ${step}`);

  if (step === "extract_audio") {
    const transcriptionDefaults = await getTranscriptionDefaults(options.profile ?? state.run_options?.profile);
    await markStarted(workspacePath, "extract_audio");
    await extractAudio(workspacePath);
    await markCompleted(workspacePath, "extract_audio");
    await markStarted(workspacePath, "transcribe");
    await transcribeAudio(workspacePath, {
      model: options.model ?? state.run_options?.model ?? transcriptionDefaults.model,
      computeType: options["compute-type"] ?? state.run_options?.compute_type ?? transcriptionDefaults.computeType,
      language: options.language ?? state.run_options?.language ?? transcriptionDefaults.language
    });
    await markCompleted(workspacePath, "transcribe");
    await continueAfterTranscribe(workspacePath, options);
    return;
  }
  if (step === "transcribe") {
    const transcriptionDefaults = await getTranscriptionDefaults(options.profile ?? state.run_options?.profile);
    await markStarted(workspacePath, "transcribe");
    await transcribeAudio(workspacePath, {
      model: options.model ?? state.run_options?.model ?? transcriptionDefaults.model,
      computeType: options["compute-type"] ?? state.run_options?.compute_type ?? transcriptionDefaults.computeType,
      language: options.language ?? state.run_options?.language ?? transcriptionDefaults.language
    });
    await markCompleted(workspacePath, "transcribe");
    await continueAfterTranscribe(workspacePath, options);
    return;
  }
  if (step === "agent_write_md" || step === "ready_for_agent") {
    if (options["skip-agent"] || state.run_options?.skip_agent) {
      await writeMeetingTemplate(workspacePath);
      await writeState(workspacePath, {
        ...(await readState(workspacePath)),
        status: "ready",
        current_step: "ready_for_agent",
        failed_step: null
      });
      console.log("output/meeting.md 템플릿을 작성했습니다.");
      return;
    }
    await markStarted(workspacePath, "agent_write_md");
    const selectedAgent = await runAgentToWriteMeeting({ agent: options.agent ?? "auto", workspacePath });
    await markCompleted(workspacePath, "agent_write_md");
    console.log(`[4/7] 회의록 작성 완료: ${selectedAgent}`);
    await markStarted(workspacePath, "render");
    await renderCommand([path.join(workspacePath, "output", "meeting.md")]);
    await markCompleted(workspacePath, "render");
    await markStarted(workspacePath, "verify");
    await verifyCommand([workspacePath]);
    await markCompleted(workspacePath, "verify");
    return;
  }
  if (step === "verify") {
    await markStarted(workspacePath, "verify");
    await verifyCommand([workspacePath]);
    await markCompleted(workspacePath, "verify");
    return;
  }
  if (step === "render" || step === "ready_for_render") {
    await markStarted(workspacePath, "render");
    await renderCommand([path.join(workspacePath, "output", "meeting.md")]);
    await markCompleted(workspacePath, "render");
    await markStarted(workspacePath, "verify");
    await verifyCommand([workspacePath]);
    await markCompleted(workspacePath, "verify");
    return;
  }

  console.log("이 단계는 자동 재개 대상이 아닙니다. 새 작업을 시작하지 말고 위 작업 폴더의 state.json을 확인하세요.");
}

async function continueAfterTranscribe(workspacePath, options = {}) {
  const state = await readState(workspacePath);
  if (state.run_options?.skip_agent) {
    await writeMeetingTemplate(workspacePath);
    await writeState(workspacePath, {
      ...(await readState(workspacePath)),
      status: "ready",
      current_step: "ready_for_agent",
      failed_step: null
    });
    console.log("전사 재개 완료: output/meeting.md 템플릿을 작성했습니다.");
    return;
  }

  await markStarted(workspacePath, "agent_write_md");
  const selectedAgent = await runAgentToWriteMeeting({ agent: options.agent ?? state.run_options?.agent ?? "auto", workspacePath });
  await markCompleted(workspacePath, "agent_write_md");
  console.log(`[4/7] 회의록 작성 완료: ${selectedAgent}`);
  await markStarted(workspacePath, "render");
  await renderCommand([path.join(workspacePath, "output", "meeting.md")]);
  await markCompleted(workspacePath, "render");
  await markStarted(workspacePath, "verify");
  await verifyCommand([workspacePath]);
  await markCompleted(workspacePath, "verify");
  await writeState(workspacePath, {
    ...(await readState(workspacePath)),
    status: "ready",
    current_step: "complete",
    failed_step: null
  });
}

function defaultArtifacts(workspacePath) {
  return {
    workspace: workspacePath,
    meeting_info: "config/meeting_info.json",
    transcript: "work/transcript.txt",
    meeting_md: "output/meeting.md",
    meeting_docx: "output/meeting.docx",
    meeting_pdf: "output/meeting.pdf",
    verification_report: "output/verification_report.md"
  };
}

async function markCompleted(workspacePath, step) {
  const state = await readState(workspacePath);
  const completed = new Set(state.completed_steps ?? []);
  completed.add(step);
  await writeState(workspacePath, {
    ...state,
    status: "running",
    current_step: step,
    completed_steps: [...completed],
    failed_step: null,
    artifacts: { ...defaultArtifacts(workspacePath), ...(state.artifacts ?? {}) }
  });
}

async function markStarted(workspacePath, step) {
  const state = await readState(workspacePath);
  await writeState(workspacePath, {
    ...state,
    status: "running",
    current_step: step,
    failed_step: null,
    artifacts: { ...defaultArtifacts(workspacePath), ...(state.artifacts ?? {}) }
  });
}

async function markFailed(workspacePath, step, error) {
  const state = await readState(workspacePath);
  await writeState(workspacePath, {
    ...state,
    status: "failed",
    current_step: step,
    failed_step: step,
    last_error: error?.message ?? String(error),
    artifacts: { ...defaultArtifacts(workspacePath), ...(state.artifacts ?? {}) }
  });
}

async function findLatestWorkspace(baseDir) {
  const entries = await readdir(baseDir, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const workspacePath = path.join(baseDir, entry.name);
    try {
      const state = await readState(workspacePath);
      candidates.push({ workspacePath, updatedAt: Date.parse(state.updated_at ?? 0) || 0 });
    } catch {
      // Not a meeting-harness workspace.
    }
  }
  candidates.sort((a, b) => b.updatedAt - a.updatedAt);
  return candidates[0]?.workspacePath ?? null;
}

async function collectMeetingInfo({ sourceDir, workspacePath, inputFiles = [], options = {} }) {
  let combined = "";
  let foundInfoFile = false;
  for (const name of infoFileNames) {
    try {
      combined += `\n${await readFile(path.join(sourceDir, name), "utf8")}`;
      foundInfoFile = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const parsed = parseMeetingInfoText(combined);
  const inferred = inferMeetingInfo({ sourceDir, workspacePath, inputFiles });
  const shouldAsk = process.stdin.isTTY && !options.yes && !options["no-prompt"];
  const shouldConfirmOnly =
    shouldAsk && !options.prompt && !foundInfoFile && inferred.confidence === "high" && inferred.contentType === "1인 강의/연수";
  const prompted =
    shouldAsk && !shouldConfirmOnly && (!foundInfoFile || !parsed.contentType || !parsed.attendees?.length)
      ? await promptForMeetingInfo({ parsed, inferred, foundInfoFile })
      : {};

  if (shouldConfirmOnly) {
    printInferredLectureConfirmation(inferred);
  }

  if (!shouldAsk && !options.yes && !options["no-prompt"] && (!foundInfoFile || !parsed.contentType || !parsed.attendees?.length)) {
    if (!foundInfoFile && inferred.confidence === "high" && inferred.contentType === "1인 강의/연수") {
      printInferredLectureConfirmation(inferred);
    } else {
      throw new Error(missingMeetingInfoMessage());
    }
  }

  if (!shouldAsk && (options.yes || options["no-prompt"]) && (!foundInfoFile || !parsed.contentType || !parsed.attendees?.length)) {
    if (!foundInfoFile && inferred.confidence === "high" && inferred.contentType === "1인 강의/연수") {
      printInferredLectureConfirmation(inferred);
    } else {
      console.log("[회의 정보] --yes/--no-prompt 옵션에 따라 추천 기본값으로 진행합니다.");
      console.log(`[회의 정보] 자료 유형: ${parsed.contentType ?? inferred.contentType}`);
      console.log(`[회의 정보] 발화자/참석자: ${(parsed.attendees ?? inferred.attendees).join(", ") || "미상"}`);
    }
  }

  const info = {
    contentType: prompted.contentType ?? parsed.contentType ?? inferred.contentType,
    title: prompted.title ?? parsed.title ?? inferred.title,
    dateTime: parsed.dateTime ?? "",
    location: parsed.location ?? "",
    attendees: prompted.attendees ?? parsed.attendees ?? inferred.attendees,
    agenda: parsed.agenda ?? [],
    audience: parsed.audience ?? "",
    tone: parsed.tone ?? "학교/공공기관 내부 보고용 공식 문체",
    notes: prompted.notes ?? parsed.notes ?? inferred.notes
  };
  await mkdir(path.join(workspacePath, "config"), { recursive: true });
  await writeFile(path.join(workspacePath, "config", "meeting_info.json"), JSON.stringify(info, null, 2), "utf8");
  return info;
}

function missingMeetingInfoMessage() {
  return [
    "회의 정보가 부족합니다.",
    "현재 실행 환경에서는 CLI가 대화형 질문을 표시할 수 없습니다.",
    "meeting_info.txt를 입력 파일과 같은 폴더에 만들거나, 사용자에게 자료 유형과 참석자/발화자 정보를 확인한 뒤 다시 실행하세요.",
    "기본값으로 계속 진행하려면 --yes 또는 --no-prompt 옵션을 명시적으로 사용하세요.",
    "필요한 항목:",
    "- 자료 유형: 회의 / 1인 강의/연수 / 세미나 등",
    "- 제목/회의명",
    "- 참석자/발화자 정보",
    "- 특이사항"
  ].join("\n");
}

function printInferredLectureConfirmation(inferred) {
  console.log("[회의 정보] 파일명/폴더명을 기준으로 1인 강의/연수로 보입니다.");
  console.log(`[회의 정보] 자료 유형: ${inferred.contentType}`);
  console.log(`[회의 정보] 발화자/참석자: ${inferred.attendees.join(", ")}`);
  console.log("[회의 정보] 수정이 필요하면 meeting_info.txt를 추가하거나 --prompt 옵션으로 다시 실행하세요.");
}

function inferMeetingInfo({ sourceDir, workspacePath, inputFiles }) {
  const joined = [sourceDir, workspacePath, ...inputFiles].join(" ");
  const isLecture = /강의|연수|수업|특강|워크숍|세미나/i.test(joined);
  const title = path.basename(inputFiles[0] ?? workspacePath, path.extname(inputFiles[0] ?? workspacePath));
  return {
    contentType: isLecture ? "1인 강의/연수" : "회의",
    confidence: isLecture ? "high" : "low",
    title,
    attendees: isLecture ? ["강의자: 미상"] : [],
    notes: isLecture
      ? "1인 강의/연수로 추정됨. 발화자 정보는 강의 맥락 보정에만 사용한다."
      : "발화자 정보가 없으면 핵심 의견 attribution 없이 회의 흐름 중심으로 정리한다."
  };
}

async function promptForMeetingInfo({ parsed, inferred, foundInfoFile }) {
  console.log(foundInfoFile ? "[회의 정보] 정보 파일을 읽었습니다. 부족한 항목만 확인합니다." : "[회의 정보] 정보 파일을 찾지 못했습니다. 필요한 항목만 짧게 확인합니다.");
  const rl = createInterface({ input, output });
  try {
    const contentType = await askWithDefault(rl, "자료 유형", parsed.contentType ?? inferred.contentType);
    const title = await askWithDefault(rl, "제목/회의명", parsed.title ?? inferred.title);
    const attendeeDefault = (parsed.attendees ?? inferred.attendees).join(", ");
    const attendeeText = await askWithDefault(rl, "참석자/발화자 정보(쉼표 구분)", attendeeDefault);
    const notes = await askWithDefault(rl, "특이사항(없으면 Enter)", parsed.notes ?? inferred.notes);
    return {
      contentType,
      title,
      attendees: splitPromptList(attendeeText),
      notes
    };
  } finally {
    rl.close();
  }
}

async function askWithDefault(rl, label, defaultValue = "") {
  const suffix = defaultValue ? ` [추천: ${defaultValue}]` : "";
  const answer = await rl.question(`${label}${suffix}: `);
  return answer.trim() || defaultValue;
}

function splitPromptList(value) {
  if (!value?.trim()) return [];
  return value
    .split(/[,，;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
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
  meeting-harness setup [--profile auto|quality|balanced|fast]
  meeting-harness run <media-file...> [--profile auto|quality|balanced|fast] [--base-dir DIR] [--skip-media] [--skip-agent] [--new]
  meeting-harness render output/meeting.md
  meeting-harness verify [작업폴더] [--strict]
  meeting-harness resume [작업폴더]

주요 명령:
  meeting-harness run      기존 실패 작업이 있으면 재사용하고, 없으면 새 작업을 시작합니다.
  meeting-harness render   meeting.md를 DOCX/PDF로 렌더링합니다.
  meeting-harness verify   생성 결과 검증 보고서를 만듭니다.
`);
}
