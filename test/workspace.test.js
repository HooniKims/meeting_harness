import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import * as processes from "../src/processes.js";
import { createWorkspace } from "../src/workspace.js";

test("createWorkspace references source media without copying it", async (t) => {
  // Given: a source media file in the user's working directory.
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "meeting-harness-workspace-"));
  t.after(() => rm(baseDir, { recursive: true, force: true }));
  const source = path.join(baseDir, "원본 영상 (1).mp4");
  await writeFile(source, Buffer.alloc(1024, 7));

  // When: a new meeting workspace is created.
  const workspace = await createWorkspace({
    inputFiles: [source],
    baseDir,
    now: new Date("2026-08-17T12:00:00+09:00")
  });

  // Then: only the normalized source reference is stored; no media bytes are copied.
  assert.deepEqual(await readdir(path.join(workspace.path, "input")), []);
  assert.deepEqual(workspace.state.source_files, [path.resolve(source).normalize("NFC")]);
});

test("resolveWorkspaceInputPaths preserves referenced source order", async (t) => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "meeting-harness-sources-"));
  t.after(() => rm(baseDir, { recursive: true, force: true }));
  const first = path.join(baseDir, "첫 영상.mp4");
  const second = path.join(baseDir, "둘째 영상.mp4");
  await writeFile(first, "first");
  await writeFile(second, "second");
  const workspace = await createWorkspace({ inputFiles: [second, first], baseDir });

  assert.deepEqual(await processes.resolveWorkspaceInputPaths(workspace.path), [
    path.resolve(second).normalize("NFC"),
    path.resolve(first).normalize("NFC")
  ]);
});

test("resolveWorkspaceInputPaths supports legacy copied media", async (t) => {
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), "meeting-harness-legacy-"));
  t.after(() => rm(workspacePath, { recursive: true, force: true }));
  const inputDir = path.join(workspacePath, "input");
  await mkdir(inputDir);
  await writeFile(path.join(inputDir, "original_02.mp4"), "second");
  await writeFile(path.join(inputDir, "original_01.mp4"), "first");

  assert.deepEqual(await processes.resolveWorkspaceInputPaths(workspacePath), [
    path.join(inputDir, "original_01.mp4"),
    path.join(inputDir, "original_02.mp4")
  ]);
});
