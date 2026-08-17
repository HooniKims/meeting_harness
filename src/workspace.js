import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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
  const sourceFiles = normalizeInputFiles(inputFiles);

  const workspaceBase = await uniqueWorkspacePath(
    path.join(baseDir, buildWorkspaceName(path.basename(inputFiles[0]), now))
  );
  for (const relative of workspaceDirs) {
    await mkdir(path.join(workspaceBase, relative), { recursive: true });
  }

  const state = {
    job_id: path.basename(workspaceBase),
    status: "running",
    current_step: "create_workspace",
    completed_steps: ["create_workspace"],
    failed_step: null,
    source_files: sourceFiles,
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

export async function findReusableWorkspace({ inputFiles, baseDir = process.cwd() }) {
  if (!inputFiles?.length) return null;
  const expected = normalizeInputFiles(inputFiles);
  const entries = await readdir(baseDir, { withFileTypes: true });
  const candidates = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const workspacePath = path.join(baseDir, entry.name);
    let state;
    try {
      state = await readState(workspacePath);
    } catch {
      continue;
    }
    if (!isSameInputSet(state.source_files, expected)) continue;
    if (!isReusableState(state)) continue;
    candidates.push({ workspacePath, updatedAt: Date.parse(state.updated_at ?? 0) || 0 });
  }

  candidates.sort((a, b) => b.updatedAt - a.updatedAt);
  return candidates[0]?.workspacePath ?? null;
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

function normalizeInputFiles(inputFiles) {
  return inputFiles.map((item) => path.resolve(item).normalize("NFC"));
}

function isSameInputSet(left, right) {
  if (!Array.isArray(left) || left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function isReusableState(state) {
  if (state.status === "failed") return true;
  if (state.status === "running") return true;
  return state.current_step && !["complete", "ready"].includes(state.current_step);
}
