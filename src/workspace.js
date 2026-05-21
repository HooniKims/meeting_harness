import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildWorkspaceName } from "./core.js";

const workspaceDirs = [
  "input",
  "config",
  "work",
  "work/chunks",
  "work/chunk_summaries",
  "output",
  "output/archive",
  "logs",
  ".meeting-harness"
];

export async function createWorkspace({ inputFiles, baseDir = process.cwd(), now = new Date() }) {
  if (!inputFiles?.length) throw new Error("입력 파일이 필요합니다.");

  const workspaceBase = await uniqueWorkspacePath(
    path.join(baseDir, buildWorkspaceName(path.basename(inputFiles[0]), now))
  );
  for (const relative of workspaceDirs) {
    await mkdir(path.join(workspaceBase, relative), { recursive: true });
  }

  for (const [index, input] of inputFiles.entries()) {
    const ext = path.extname(input);
    const name = inputFiles.length === 1 ? `original${ext}` : `original_${String(index + 1).padStart(2, "0")}${ext}`;
    await copyFile(input, path.join(workspaceBase, "input", name));
  }

  const state = {
    job_id: path.basename(workspaceBase),
    status: "running",
    current_step: "create_workspace",
    completed_steps: ["create_workspace"],
    failed_step: null,
    artifacts: {
      workspace: workspaceBase
    },
    updated_at: new Date().toISOString()
  };
  await writeState(workspaceBase, state);

  return {
    path: workspaceBase,
    state
  };
}

export async function uniqueWorkspacePath(basePath) {
  let candidate = basePath;
  let suffix = 2;
  while (await exists(candidate)) {
    candidate = `${basePath}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export async function readState(workspacePath) {
  const statePath = path.join(workspacePath, ".meeting-harness", "state.json");
  return JSON.parse(await readFile(statePath, "utf8"));
}

export async function writeState(workspacePath, state) {
  const stateDir = path.join(workspacePath, ".meeting-harness");
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    path.join(stateDir, "state.json"),
    JSON.stringify({ ...state, updated_at: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

async function exists(target) {
  try {
    await readFile(target);
    return true;
  } catch (error) {
    if (error.code === "EISDIR") return true;
    if (error.code === "ENOENT") return false;
    return false;
  }
}
