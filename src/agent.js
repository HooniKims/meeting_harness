import { spawnSync } from "node:child_process";

import { run } from "./processes.js";

const supportedAgents = ["codex", "claude"];

export function detectAgent({ preferred = "auto", env = process.env } = {}) {
  const normalized = String(preferred || "auto").toLowerCase();
  if (supportedAgents.includes(normalized)) {
    return commandExists(normalized) ? normalized : null;
  }

  if (env.CLAUDECODE || env.CLAUDE_CODE || env.ANTHROPIC_API_KEY) {
    if (commandExists("claude")) return "claude";
  }
  if (env.CODEX_HOME || env.OPENAI_API_KEY) {
    if (commandExists("codex")) return "codex";
  }
  if (commandExists("codex")) return "codex";
  if (commandExists("claude")) return "claude";
  return null;
}

export function buildAgentCommand(agent, workspacePath, prompt) {
  if (agent === "codex") {
    return {
      command: "codex",
      args: [
        "exec",
        "--cd",
        workspacePath,
        "--skip-git-repo-check",
        "--sandbox",
        "workspace-write",
        "--ask-for-approval",
        "never",
        prompt
      ],
      cwd: workspacePath
    };
  }
  if (agent === "claude") {
    return {
      command: "claude",
      args: [
        "--print",
        "--permission-mode",
        "acceptEdits",
        "--add-dir",
        workspacePath,
        prompt
      ],
      cwd: workspacePath
    };
  }
  throw new Error(`지원하지 않는 에이전트입니다: ${agent}`);
}

export async function runAgentToWriteMeeting({ agent, workspacePath }) {
  const selected = detectAgent({ preferred: agent });
  if (!selected) {
    throw new Error("Codex 또는 Claude CLI를 찾을 수 없습니다. --skip-agent로 준비만 하거나 CLI를 설치하세요.");
  }
  const prompt = buildMeetingPrompt(selected);
  const { command, args, cwd } = buildAgentCommand(selected, workspacePath, prompt);
  await run(command, args, { cwd });
  return selected;
}

export function buildMeetingPrompt(agent) {
  const instructionFile = agent === "claude" ? "CLAUDE.md" : "AGENTS.md";
  return [
    `${instructionFile}를 읽고 이 작업 폴더의 회의록을 작성하세요.`,
    "입력은 work/transcript.txt, work/transcript.json, config/meeting_info.json입니다.",
    "최종 산출물은 output/meeting.md 하나입니다.",
    "필수 섹션은 회의 개요, 전체 요약, 회의 흐름, 주요 안건별 논의, 공통 의견, 이견 및 쟁점, 결정 사항, 후속 조치입니다.",
    "모든 발화를 나열하지 말고 회의 맥락, 공통 의견, 차이가 나는 의견, 방향성, 결정 사항을 중심으로 정리하세요.",
    "핵심 의견이 있는 경우에만 참석자 이름과 역할을 붙이세요.",
    "불확실한 내용은 추가 확인 필요로 표시하세요.",
    "작업이 끝나면 output/meeting.md가 존재하는지 확인하세요."
  ].join("\n");
}

function commandExists(command) {
  const probe = process.platform === "win32" ? "where.exe" : "command";
  const args = process.platform === "win32" ? [command] : ["-v", command];
  const result = spawnSync(probe, args, { stdio: "ignore", shell: process.platform !== "win32" });
  return result.status === 0;
}
