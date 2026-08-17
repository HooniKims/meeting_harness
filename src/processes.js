import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readState } from "./workspace.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export async function extractAudio(workspacePath) {
  const inputPaths = await resolveWorkspaceInputPaths(workspacePath);
  const output = path.join(workspacePath, "work", "audio.wav");
  await run("ffmpeg", buildExtractAudioArgs(inputPaths, output), {
    cwd: workspacePath
  });
}

export async function resolveWorkspaceInputPaths(workspacePath) {
  const inputDir = path.join(workspacePath, "input");
  const legacyFiles = (await readdir(inputDir))
    .filter((file) => file.startsWith("original"))
    .sort()
    .map((file) => path.join(inputDir, file));
  if (legacyFiles.length) return legacyFiles;

  const state = await readState(workspacePath);
  const sourceFiles = Array.isArray(state.source_files) ? state.source_files : [];
  if (!sourceFiles.length) throw new Error("원본 미디어 경로를 찾을 수 없습니다.");
  for (const sourceFile of sourceFiles) {
    try {
      if (!(await stat(sourceFile)).isFile()) throw new Error();
    } catch {
      throw new Error(`원본 미디어 파일을 찾을 수 없습니다: ${sourceFile}`);
    }
  }
  return sourceFiles;
}

export function buildExtractAudioArgs(inputPaths, outputPath) {
  if (!inputPaths?.length) throw new Error("입력 파일이 필요합니다.");
  const baseArgs = ["-hide_banner", "-loglevel", "error", "-y"];
  if (inputPaths.length === 1) {
    return [...baseArgs, "-i", inputPaths[0], "-vn", "-ac", "1", "-ar", "16000", outputPath];
  }

  const inputArgs = inputPaths.flatMap((inputPath) => ["-i", inputPath]);
  const concatInputs = inputPaths.map((_, index) => `[${index}:a:0]`).join("");
  return [
    ...baseArgs,
    ...inputArgs,
    "-filter_complex",
    `${concatInputs}concat=n=${inputPaths.length}:v=0:a=1[outa]`,
    "-map",
    "[outa]",
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    outputPath
  ];
}

export async function transcribeAudio(workspacePath, { model = "large-v3", computeType = "auto", language = "ko" } = {}) {
  await runPythonWorker("transcribe_audio.py", [
    "--audio",
    path.join(workspacePath, "work", "audio.wav"),
    "--output-txt",
    path.join(workspacePath, "work", "transcript.txt"),
    "--output-json",
    path.join(workspacePath, "work", "transcript.json"),
    "--model",
    model,
    "--compute-type",
    computeType,
    "--language",
    language
  ]);
}

export async function runPythonWorker(scriptName, args) {
  const script = path.resolve(moduleDir, "..", "workers", scriptName);
  const python = resolvePythonCommand();
  await run(python.command, [...python.prefixArgs, script, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8"
    }
  });
}

export function resolvePythonCommand() {
  if (process.env.MEETING_HARNESS_PYTHON && existsSync(process.env.MEETING_HARNESS_PYTHON)) {
    return { command: process.env.MEETING_HARNESS_PYTHON, prefixArgs: [] };
  }

  const installRoot = path.resolve(moduleDir, "..", "..");
  const homeInstallRoot = path.join(os.homedir(), ".meeting-harness");
  const venvCandidates =
    process.platform === "win32"
      ? [
          path.join(installRoot, "venv", "Scripts", "python.exe"),
          path.join(homeInstallRoot, "venv", "Scripts", "python.exe")
        ]
      : [
          path.join(installRoot, "venv", "bin", "python"),
          path.join(homeInstallRoot, "venv", "bin", "python")
        ];

  for (const candidate of venvCandidates) {
    if (existsSync(candidate)) {
      return { command: candidate, prefixArgs: [] };
    }
  }

  return { command: process.platform === "win32" ? "python" : "python3", prefixArgs: [] };
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const prepared = prepareSpawnCommand(command);
    const child = spawn(prepared.command, args, { stdio: "inherit", shell: prepared.shell, ...options });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} 종료 코드 ${code}`));
    });
  });
}

function prepareSpawnCommand(command) {
  if (process.platform !== "win32" || path.isAbsolute(command)) {
    return { command, shell: false };
  }

  const probe = spawnSync("where.exe", [command], { encoding: "utf8" });
  const resolved = probe.status === 0 ? probe.stdout.split(/\r?\n/).find(Boolean) : "";
  if (!resolved) return { command, shell: false };
  return {
    command: resolved,
    shell: /\.(?:cmd|bat)$/i.test(resolved)
  };
}
