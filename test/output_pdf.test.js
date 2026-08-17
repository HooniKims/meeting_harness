import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("render emits only the meeting-title PDF", async (t) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "meeting-harness-output-"));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const outputDir = path.join(workspace, "output");
  const configDir = path.join(workspace, "config");
  await mkdir(outputDir);
  await mkdir(configDir);
  const markdownPath = path.join(outputDir, "meeting.md");
  await writeFile(markdownPath, "# 성장형 해커톤 운영 회의록\n\n## 회의 개요\n본문\n", "utf8");
  await writeFile(path.join(configDir, "meeting_info.json"), "{}\n", "utf8");
  await writeFile(path.join(outputDir, "이전 회의.pdf"), "stale", "utf8");

  const result = spawnSync(process.execPath, [path.join(projectRoot, "bin", "meeting-harness.js"), "render", markdownPath], {
    cwd: projectRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  const pdfFiles = (await readdir(outputDir)).filter((name) => name.endsWith(".pdf")).sort();
  assert.deepEqual(pdfFiles, ["성장형 해커톤 운영 회의록.pdf"]);
});
