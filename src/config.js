import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function getInstallRoot() {
  return path.join(os.homedir(), ".meeting-harness");
}

export function getConfigPath() {
  return path.join(getInstallRoot(), "config.json");
}

export async function readHarnessConfig() {
  try {
    return JSON.parse(await readFile(getConfigPath(), "utf8"));
  } catch {
    return {};
  }
}

export async function writeHarnessConfig(config) {
  await mkdir(getInstallRoot(), { recursive: true });
  await writeFile(getConfigPath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function detectHardwareProfile() {
  const totalMemoryGb = Math.round((os.totalmem() / 1024 ** 3) * 10) / 10;
  const cpuCount = os.cpus()?.length ?? 0;
  const gpu = detectNvidiaGpu();
  return {
    platform: process.platform,
    arch: process.arch,
    cpuCount,
    totalMemoryGb,
    gpu
  };
}

export function recommendTranscriptionSettings(profile = detectHardwareProfile()) {
  const gpuMemoryGb = profile.gpu?.memoryGb ?? 0;
  let model = "large-v3";
  let computeType = "int8";
  const reasons = [];

  if (gpuMemoryGb >= 10) {
    computeType = "float16";
    reasons.push(`NVIDIA GPU 메모리 ${gpuMemoryGb}GB 감지`);
  } else if (gpuMemoryGb >= 6) {
    computeType = "int8_float16";
    reasons.push(`NVIDIA GPU 메모리 ${gpuMemoryGb}GB 감지`);
  } else if (profile.totalMemoryGb < 8) {
    model = "small";
    reasons.push(`시스템 메모리 ${profile.totalMemoryGb}GB로 낮음`);
  } else if (profile.totalMemoryGb < 16) {
    model = "medium";
    reasons.push(`시스템 메모리 ${profile.totalMemoryGb}GB로 제한적`);
  } else {
    reasons.push(`시스템 메모리 ${profile.totalMemoryGb}GB 기준 품질 우선`);
  }

  if (!profile.gpu) {
    reasons.push("NVIDIA GPU가 감지되지 않아 CPU/범용 설정 사용");
  }

  return {
    model,
    computeType,
    language: "ko",
    policy: "quality-first",
    reasons
  };
}

function detectNvidiaGpu() {
  const result = spawnSync(
    "nvidia-smi",
    ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
    { encoding: "utf8" }
  );
  if (result.error || result.status !== 0 || !result.stdout.trim()) return null;
  const first = result.stdout.trim().split(/\r?\n/)[0];
  const [name, memoryMbText] = first.split(",").map((item) => item.trim());
  const memoryMb = Number(memoryMbText);
  return {
    name,
    memoryGb: Number.isFinite(memoryMb) ? Math.round((memoryMb / 1024) * 10) / 10 : 0
  };
}
