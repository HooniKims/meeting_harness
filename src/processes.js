import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export async function extractAudio(workspacePath) {
  const inputDir = path.join(workspacePath, "input");
  const files = await readdir(inputDir);
  const inputs = files.filter((file) => file.startsWith("original"));
  if (!inputs.length) throw new Error("input/original 파일을 찾을 수 없습니다.");

  const input = path.join(inputDir, inputs[0]);
  const output = path.join(workspacePath, "work", "audio.wav");
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", output], {
    cwd: workspacePath
  });
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
  await run("python", [script, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8"
    }
  });
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32", ...options });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} 종료 코드 ${code}`));
    });
  });
}
